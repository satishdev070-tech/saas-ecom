import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { storeOrigin } from "@/lib/platform/urls";
import { tenantDirectory } from "@/lib/tenant/directory";
import { markOrderPaid, rupees } from "@/features/checkout/post-order";
import { orderIdFromToken, orderPath, paymentPath } from "@/features/checkout/order-access";
import { loadCashfreeCredentials, loadPayuCredentials, loadRazorpayCredentials, type OnlineProviderId } from "./credentials";
import { createCashfreeOrder, getCashfreeOrder, getCashfreeOrderPayments } from "./cashfree";
import { buildPayuForm, verifyPayuTransaction } from "./payu";
import { getPaymentProvider } from "./provider";
import { verifyCashfreeWebhookSignature, verifyPayuResponse } from "./signature";
import { emit } from "@/features/notifications/events";

/**
 * Gateway sessions for the pay page. Nothing the browser sends back is trusted: every success is
 * re-read from the provider's own API (Cashfree Get Order / PayU verify_payment) and then goes
 * through svc_mark_order_paid, which is idempotent and checks the amount.
 */

export type GatewayStart =
  | { kind: "razorpay"; keyId: string; providerOrderId: string }
  | { kind: "cashfree"; mode: "sandbox" | "production"; paymentSessionId: string }
  | { kind: "payu"; action: string; fields: Record<string, string> };

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type PendingOrder = { id: string; order_number: number; grand_total: number; email: string | null; phone: string; status: string; payment_status: string; payment_method: string; shipping_address: unknown };

async function pendingOrder(admin: Admin, tenantId: string, token: string): Promise<PendingOrder> {
  const orderId = orderIdFromToken(token);
  if (!orderId) throw new AppError("NOT_FOUND");
  const { data } = await admin
    .from("orders")
    .select("id, order_number, grand_total, email, phone, status, payment_status, payment_method, shipping_address")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

function shopperName(o: PendingOrder): string {
  const a = (o.shipping_address ?? {}) as { name?: unknown };
  return (typeof a.name === "string" ? a.name : "Customer").slice(0, 60);
}

/** Starts (or resumes) a payment with the chosen gateway for an unpaid online order. */
export async function startGatewayPayment(tenantId: string, storeHost: string, token: string, provider: OnlineProviderId): Promise<GatewayStart> {
  const admin = createSupabaseAdminClient();
  const o = await pendingOrder(admin, tenantId, token);
  if (o.payment_status === "paid" || o.payment_method !== "online" || o.status === "cancelled") throw new AppError("CONFLICT", { message: "This order can't be paid online any more." });
  const amountMinor = toMinor(o.grand_total);
  const origin = storeOrigin(storeHost);

  if (provider === "razorpay") {
    const creds = await loadRazorpayCredentials(tenantId);
    if (!creds) throw new AppError("CONFLICT", { message: "Razorpay isn't available right now." });
    const init = await getPaymentProvider("razorpay").initiate({ id: o.id, tenantId, orderNumber: o.order_number, grandTotalMinor: amountMinor, email: o.email, phone: o.phone });
    if (init.kind !== "pay_page") throw new AppError("CONFLICT");
    return { kind: "razorpay", keyId: creds.keyId, providerOrderId: init.providerOrderId };
  }

  if (provider === "cashfree") {
    const creds = await loadCashfreeCredentials(tenantId);
    if (!creds) throw new AppError("CONFLICT", { message: "Cashfree isn't available right now." });
    // One Cashfree order per our order (Cashfree order ids are unique per merchant; 409 → reuse).
    const cfOrderId = `pl_${o.id.replace(/-/g, "")}`;
    const cf = await createCashfreeOrder(creds, {
      orderId: cfOrderId,
      amountRupees: amountMinor / 100,
      customer: { id: `c_${o.id.slice(0, 8)}`, phone: o.phone, email: o.email, name: shopperName(o) },
      returnUrl: `${origin}/checkout/pay/return?provider=cashfree&t=${encodeURIComponent(token)}`,
      notifyUrl: `${origin}/api/webhooks/cashfree`,
      note: `Order ${o.order_number}`,
    });
    if (Math.round(cf.order_amount * 100) !== amountMinor) throw new AppError("INTERNAL", { context: { reason: "cashfree amount mismatch" } });
    if (!cf.payment_session_id) throw new AppError("CONFLICT", { message: "Cashfree couldn't start this payment. Please try again." });
    await upsertAttempt(admin, tenantId, o.id, "cashfree", cfOrderId, amountMinor);
    return { kind: "cashfree", mode: creds.environment === "live" ? "production" : "sandbox", paymentSessionId: cf.payment_session_id };
  }

  if (provider === "payu") {
    const creds = await loadPayuCredentials(tenantId);
    if (!creds) throw new AppError("CONFLICT", { message: "PayU isn't available right now." });
    // A fresh txnid per attempt (PayU rejects reused txnids); all attempts point at this order via udf1.
    const txnid = `pl${o.order_number}x${Date.now().toString(36)}`.slice(0, 25);
    await upsertAttempt(admin, tenantId, o.id, "payu", txnid, amountMinor, true);
    const callback = `${origin}/checkout/pay/payu?t=${encodeURIComponent(token)}`;
    const form = buildPayuForm(creds, {
      txnid,
      amount: (amountMinor / 100).toFixed(2),
      productinfo: `Order ${o.order_number}`,
      firstname: shopperName(o).split(" ")[0] ?? "Customer",
      email: o.email ?? "noreply@example.com",
      phone: o.phone,
      udf1: o.id,
      surl: callback,
      furl: callback,
    });
    return { kind: "payu", action: form.action, fields: form.fields };
  }
  throw new AppError("VALIDATION");
}

async function upsertAttempt(admin: Admin, tenantId: string, orderId: string, provider: "cashfree" | "payu", providerOrderId: string, amountMinor: number, alwaysNew = false) {
  if (!alwaysNew) {
    const { data } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("order_id", orderId).eq("provider", provider).eq("provider_order_id", providerOrderId).maybeSingle();
    if (data) return;
  }
  const { error } = await admin.from("payments").insert({ tenant_id: tenantId, order_id: orderId, provider, provider_order_id: providerOrderId, amount: rupees(amountMinor), status: "created" });
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
}

// ------------------------------------------------------------------ Cashfree confirmation

/** Authoritative Cashfree check for one of our orders: PAID + matching amount → mark paid. */
async function settleCashfree(admin: Admin, tenantId: string, orderId: string, cfOrderId: string): Promise<"paid" | "pending" | "failed"> {
  const creds = await loadCashfreeCredentials(tenantId, { requireEnabled: false });
  if (!creds) throw new AppError("CONFLICT", { message: "Cashfree isn't configured for this store." });
  const [{ data: order }, cf] = await Promise.all([admin.from("orders").select("grand_total, payment_status").eq("tenant_id", tenantId).eq("id", orderId).single(), getCashfreeOrder(creds, cfOrderId)]);
  if (!order) throw new AppError("NOT_FOUND");
  if (order.payment_status === "paid") return "paid";
  if (cf.order_status !== "PAID") {
    const payments = await getCashfreeOrderPayments(creds, cfOrderId).catch(() => []);
    const failed = payments.find((p) => p.payment_status === "FAILED" || p.payment_status === "USER_DROPPED");
    if (failed) await admin.from("payments").update({ error_description: String(failed.payment_message ?? "Payment was not completed").slice(0, 200) }).eq("tenant_id", tenantId).eq("provider", "cashfree").eq("provider_order_id", cfOrderId);
    return failed ? "failed" : "pending";
  }
  const amountMinor = Math.round(cf.order_amount * 100);
  if (amountMinor !== toMinor(order.grand_total)) throw new AppError("CONFLICT", { context: { hint: "AMOUNT_MISMATCH" } });
  const payments = await getCashfreeOrderPayments(creds, cfOrderId);
  const success = payments.find((p) => p.payment_status === "SUCCESS");
  await markOrderPaid({ tenantId, orderId, provider: "cashfree", providerOrderId: cfOrderId, providerPaymentId: String(success?.cf_payment_id ?? cf.cf_order_id ?? cfOrderId), amountMinor, method: success?.payment_group ?? null });
  return "paid";
}

export async function confirmCashfreeReturn(tenantId: string, token: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const o = await pendingOrder(admin, tenantId, token);
  const cfOrderId = `pl_${o.id.replace(/-/g, "")}`;
  try {
    const r = await settleCashfree(admin, tenantId, o.id, cfOrderId);
    if (r === "paid") return `${orderPath(o.id)}&placed=1`;
    if (r === "failed") return `${paymentPath(o.id)}&error=payment_failed`;
    return `${orderPath(o.id)}&payment=processing`;
  } catch (err) {
    logger.warn("payments.cashfree_confirm_deferred", { tenantId, orderId: o.id, error: err });
    return `${orderPath(o.id)}&payment=processing`;
  }
}

// ------------------------------------------------------------------ PayU callback (surl/furl)

export async function handlePayuCallback(tenantId: string, token: string, params: Record<string, string>): Promise<string> {
  const admin = createSupabaseAdminClient();
  const o = await pendingOrder(admin, tenantId, token);
  const creds = await loadPayuCredentials(tenantId, { requireEnabled: false });
  if (!creds) return `${paymentPath(o.id)}&error=unavailable`;
  // 1. The response must be signed with this store's salt and belong to this order and merchant.
  if (!verifyPayuResponse(params, creds.salt) || params.key !== creds.merchantKey || params.udf1 !== o.id) {
    logger.warn("payments.payu_callback_rejected", { tenantId, orderId: o.id });
    return `${paymentPath(o.id)}&error=verification_failed`;
  }
  return settlePayu(admin, tenantId, o.id, params.txnid ?? "");
}

async function settlePayu(admin: Admin, tenantId: string, orderId: string, txnid: string): Promise<string> {
  const creds = await loadPayuCredentials(tenantId, { requireEnabled: false });
  if (!creds || !txnid) return `${paymentPath(orderId)}&error=unavailable`;
  const { data: attempt } = await admin.from("payments").select("id").eq("tenant_id", tenantId).eq("order_id", orderId).eq("provider", "payu").eq("provider_order_id", txnid).maybeSingle();
  if (!attempt) return `${paymentPath(orderId)}&error=verification_failed`;
  // 2. Authoritative status from PayU's verify_payment API.
  const tx = await verifyPayuTransaction(creds, txnid).catch((err: unknown) => {
    logger.warn("payments.payu_verify_failed", { tenantId, orderId, error: err });
    return null;
  });
  if (!tx) return `${orderPath(orderId)}&payment=processing`;
  if (tx.status === "success") {
    const { data: order } = await admin.from("orders").select("grand_total").eq("tenant_id", tenantId).eq("id", orderId).single();
    const amountMinor = Math.round(Number(tx.amt) * 100);
    if (!order || amountMinor !== toMinor(order.grand_total)) {
      logger.error("payments.payu_amount_mismatch", { tenantId, orderId, txnid });
      return `${orderPath(orderId)}&payment=processing`;
    }
    await markOrderPaid({ tenantId, orderId, provider: "payu", providerOrderId: txnid, providerPaymentId: String(tx.mihpayid ?? txnid), amountMinor, method: tx.mode ?? null });
    return `${orderPath(orderId)}&placed=1`;
  }
  if (tx.status === "pending") return `${orderPath(orderId)}&payment=processing`;
  await admin.from("payments").update({ status: "failed", error_description: String(tx.error_Message ?? "Payment failed").slice(0, 200) }).eq("id", attempt.id);
  return `${paymentPath(orderId)}&error=payment_failed`;
}

// ------------------------------------------------------------------ webhooks (store host = tenant)

export type WebhookResult = { status: number; body: Record<string, unknown> };

async function claimEvent(admin: Admin, provider: string, eventId: string, tenantId: string, type: string): Promise<boolean> {
  const { error } = await admin.from("webhook_events").insert({ provider, event_id: eventId, tenant_id: tenantId, event_type: type });
  if (!error) return true;
  if (error.code !== "23505") throw new AppError("INTERNAL", { context: { db: error.message } });
  const { data } = await admin.from("webhook_events").select("processed_at").eq("provider", provider).eq("event_id", eventId).maybeSingle();
  return !data?.processed_at; // unprocessed earlier attempt → retry it
}

export async function handleCashfreeWebhook(input: { host: string | null; rawBody: string; timestamp: string | null; signature: string | null }): Promise<WebhookResult> {
  const tenant = input.host ? await tenantDirectory.findByHost(input.host) : null;
  if (!tenant) return { status: 404, body: { error: "unknown store" } };
  const creds = await loadCashfreeCredentials(tenant.tenantId, { requireEnabled: false });
  if (!creds) return { status: 404, body: { error: "not configured" } };
  if (!verifyCashfreeWebhookSignature({ rawBody: input.rawBody, timestamp: input.timestamp, signature: input.signature, secretKey: creds.secretKey })) {
    return { status: 401, body: { error: "invalid signature" } };
  }
  let event: { type?: string; data?: { order?: { order_id?: string }; payment?: { cf_payment_id?: string | number } } };
  try {
    event = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }
  const type = String(event.type ?? "");
  const cfOrderId = event.data?.order?.order_id;
  if (!cfOrderId || !["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"].includes(type)) return { status: 200, body: { ok: true, ignored: true } };
  const admin = createSupabaseAdminClient();
  const eventId = createHash("sha256").update(`${type}:${cfOrderId}:${event.data?.payment?.cf_payment_id ?? ""}`).digest("hex");
  if (!(await claimEvent(admin, "cashfree", eventId, tenant.tenantId, type))) return { status: 200, body: { ok: true, duplicate: true } };
  const { data: attempt } = await admin.from("payments").select("order_id").eq("tenant_id", tenant.tenantId).eq("provider", "cashfree").eq("provider_order_id", cfOrderId).maybeSingle();
  if (!attempt) {
    await admin.from("webhook_events").update({ processed_at: new Date().toISOString(), error: "no matching order" }).eq("provider", "cashfree").eq("event_id", eventId);
    return { status: 200, body: { ok: true, unmatched: true } };
  }
  try {
    const outcome = await settleCashfree(admin, tenant.tenantId, attempt.order_id, cfOrderId);
    if (outcome === "failed") emit({ type: "order.status_changed", tenantId: tenant.tenantId, orderId: attempt.order_id, status: "payment_failed" });
    await admin.from("webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("provider", "cashfree").eq("event_id", eventId);
    return { status: 200, body: { ok: true, outcome } };
  } catch (err) {
    logger.error("webhook.cashfree.failed", { tenantId: tenant.tenantId, error: err });
    await admin.from("webhook_events").update({ error: err instanceof Error ? err.message.slice(0, 200) : "failed" }).eq("provider", "cashfree").eq("event_id", eventId);
    return { status: 500, body: { error: "temporary failure" } };
  }
}

/** PayU server-to-server webhook (configure https://{store}/api/webhooks/payu in PayU Dashboard). */
export async function handlePayuWebhook(input: { host: string | null; params: Record<string, string> }): Promise<WebhookResult> {
  const tenant = input.host ? await tenantDirectory.findByHost(input.host) : null;
  if (!tenant) return { status: 404, body: { error: "unknown store" } };
  const creds = await loadPayuCredentials(tenant.tenantId, { requireEnabled: false });
  if (!creds) return { status: 404, body: { error: "not configured" } };
  if (!verifyPayuResponse(input.params, creds.salt) || input.params.key !== creds.merchantKey) return { status: 401, body: { error: "invalid hash" } };
  const txnid = input.params.txnid ?? "";
  const admin = createSupabaseAdminClient();
  const { data: attempt } = await admin.from("payments").select("order_id").eq("tenant_id", tenant.tenantId).eq("provider", "payu").eq("provider_order_id", txnid).maybeSingle();
  if (!attempt || attempt.order_id !== input.params.udf1) return { status: 200, body: { ok: true, unmatched: true } };
  const eventId = `${txnid}:${input.params.mihpayid ?? ""}:${input.params.status ?? ""}`;
  if (!(await claimEvent(admin, "payu", eventId, tenant.tenantId, input.params.status ?? "unknown"))) return { status: 200, body: { ok: true, duplicate: true } };
  try {
    const next = await settlePayu(admin, tenant.tenantId, attempt.order_id, txnid);
    if (next?.includes("error=payment_failed")) emit({ type: "order.status_changed", tenantId: tenant.tenantId, orderId: attempt.order_id, status: "payment_failed" });
    await admin.from("webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("provider", "payu").eq("event_id", eventId);
    return { status: 200, body: { ok: true, outcome: next.includes("placed=1") ? "paid" : "not paid" } };
  } catch (err) {
    logger.error("webhook.payu.failed", { tenantId: tenant.tenantId, error: err });
    return { status: 500, body: { error: "temporary failure" } };
  }
}
