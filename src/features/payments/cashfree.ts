import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Cashfree Payment Gateway (PG) REST client, per cashfree.com/docs/api-reference/payments.
 * Auth: x-client-id / x-client-secret headers + x-api-version. Sandbox and production hosts differ.
 */
export type CashfreeCredentials = { appId: string; secretKey: string; environment: "test" | "live" };
export const CASHFREE_API_VERSION = "2025-01-01";

const base = (env: "test" | "live") => (env === "live" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");

export type CashfreeOrder = { cf_order_id?: string | number; order_id: string; order_amount: number; order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | string; payment_session_id?: string };
export type CashfreePayment = { cf_payment_id: string | number; payment_status: string; payment_amount: number; payment_group?: string; payment_message?: string };

async function call<T>(creds: CashfreeCredentials, method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base(creds.environment)}${path}`, {
    method,
    headers: {
      "x-client-id": creds.appId,
      "x-client-secret": creds.secretKey,
      "x-api-version": CASHFREE_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new AppError("INTERNAL", { message: "Cashfree is unreachable.", context: { path, error: err instanceof Error ? err.message : String(err) } });
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

function fail(path: string, status: number, json: unknown): never {
  const msg = String((json as { message?: unknown })?.message ?? "").slice(0, 200);
  logger.warn("cashfree.api_error", { path, status, message: msg });
  throw new AppError(status === 400 || status === 422 ? "VALIDATION" : status === 401 ? "FORBIDDEN" : "INTERNAL", { message: "Cashfree rejected the request.", context: { path, status } });
}

/** Creates (or, if it already exists, returns) the Cashfree order for our order id. */
export async function createCashfreeOrder(
  creds: CashfreeCredentials,
  input: { orderId: string; amountRupees: number; customer: { id: string; phone: string; email: string | null; name: string | null }; returnUrl: string; notifyUrl: string; note: string },
): Promise<CashfreeOrder> {
  const phone = input.customer.phone.replace(/\D/g, "").slice(-10);
  const { status, json } = await call<CashfreeOrder>(creds, "POST", "/orders", {
    order_id: input.orderId,
    order_amount: Number(input.amountRupees.toFixed(2)),
    order_currency: "INR",
    customer_details: { customer_id: input.customer.id, customer_phone: phone, customer_email: input.customer.email ?? undefined, customer_name: input.customer.name ?? undefined },
    order_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
    order_note: input.note.slice(0, 200),
  }, input.orderId);
  if (status === 409) return getCashfreeOrder(creds, input.orderId);
  if (status !== 200) fail("/orders", status, json);
  return json;
}

export async function getCashfreeOrder(creds: CashfreeCredentials, orderId: string): Promise<CashfreeOrder> {
  const path = `/orders/${encodeURIComponent(orderId)}`;
  const { status, json } = await call<CashfreeOrder>(creds, "GET", path);
  if (status !== 200) fail(path, status, json);
  return json;
}

export async function getCashfreeOrderPayments(creds: CashfreeCredentials, orderId: string): Promise<CashfreePayment[]> {
  const path = `/orders/${encodeURIComponent(orderId)}/payments`;
  const { status, json } = await call<CashfreePayment[]>(creds, "GET", path);
  if (status !== 200) fail(path, status, json);
  return Array.isArray(json) ? json : [];
}

export async function createCashfreeRefund(creds: CashfreeCredentials, orderId: string, input: { refundId: string; amountRupees: number; note: string }) {
  const path = `/orders/${encodeURIComponent(orderId)}/refunds`;
  const { status, json } = await call<{ cf_refund_id?: string | number; refund_status?: string }>(creds, "POST", path, {
    refund_amount: Number(input.amountRupees.toFixed(2)),
    refund_id: input.refundId,
    refund_note: input.note.slice(0, 100),
  }, input.refundId);
  if (status !== 200) fail(path, status, json);
  return json;
}

/** Credentials check: an unknown order id returns 404 for valid keys and 401 for invalid ones. */
export async function testCashfree(creds: CashfreeCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const { status } = await call(creds, "GET", `/orders/paliya_connection_test_${Date.now()}`);
    if (status === 404 || status === 200) return { ok: true, message: `Connected to Cashfree ${creds.environment === "live" ? "production" : "sandbox"}.` };
    if (status === 401 || status === 403) return { ok: false, message: "Invalid credentials: check the App ID, Secret Key and environment." };
    return { ok: false, message: `Cashfree returned an unexpected response (${status}).` };
  } catch {
    return { ok: false, message: "Network error: Cashfree could not be reached." };
  }
}
