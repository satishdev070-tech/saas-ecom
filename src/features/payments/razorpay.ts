import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import type { RazorpayCredentials } from "./credentials";

/** Minimal Razorpay REST client (fetch + basic auth; no SDK dependency). */
const API = "https://api.razorpay.com/v1";

async function call<T>(creds: RazorpayCredentials, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new AppError("INTERNAL", { message: "The payment provider is unreachable. Please try again.", context: { path, error: err instanceof Error ? err.message : String(err) } });
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; description?: string } };
  if (!res.ok) {
    logger.warn("razorpay.api_error", { path, status: res.status, code: json.error?.code, description: json.error?.description });
    throw new AppError(res.status === 400 ? "VALIDATION" : "INTERNAL", {
      message: "The payment provider rejected the request.",
      context: { path, status: res.status, code: json.error?.code },
    });
  }
  return json;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string };
export type RazorpayPayment = { id: string; order_id: string | null; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed"; method: string | null; captured: boolean };
export type RazorpayRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed" };

export function createRazorpayOrder(creds: RazorpayCredentials, input: { amountMinor: number; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>(creds, "POST", "/orders", { amount: input.amountMinor, currency: "INR", receipt: input.receipt.slice(0, 40), notes: input.notes });
}

export function fetchRazorpayPayment(creds: RazorpayCredentials, paymentId: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new AppError("VALIDATION");
  return call<RazorpayPayment>(creds, "GET", `/payments/${paymentId}`);
}

export function captureRazorpayPayment(creds: RazorpayCredentials, paymentId: string, amountMinor: number) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new AppError("VALIDATION");
  return call<RazorpayPayment>(creds, "POST", `/payments/${paymentId}/capture`, { amount: amountMinor, currency: "INR" });
}

export function createRazorpayRefund(creds: RazorpayCredentials, paymentId: string, input: { amountMinor: number; notes: Record<string, string>; receipt?: string }) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new AppError("VALIDATION");
  return call<RazorpayRefund>(creds, "POST", `/payments/${paymentId}/refund`, { amount: input.amountMinor, speed: "normal", notes: input.notes, ...(input.receipt ? { receipt: input.receipt.slice(0, 40) } : {}) });
}

/** Credentials check: listing one order succeeds for valid keys; Razorpay returns 401 otherwise. */
export async function testRazorpay(creds: RazorpayCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API}/orders?count=1`, {
      headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, message: `Connected to Razorpay (${creds.mode} mode).` };
    if (res.status === 401) return { ok: false, message: "Invalid credentials: check the Key ID and Key Secret." };
    return { ok: false, message: `Razorpay returned an unexpected response (${res.status}).` };
  } catch {
    return { ok: false, message: "Network error: Razorpay could not be reached." };
  }
}
