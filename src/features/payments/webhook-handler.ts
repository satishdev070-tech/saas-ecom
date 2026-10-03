import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { tenantDirectory } from "@/lib/tenant/directory";
import { markOrderPaid, rupees } from "@/features/checkout/post-order";
import { loadRazorpayCredentials, type RazorpayCredentials } from "./credentials";
import { captureRazorpayPayment } from "./razorpay";
import { verifyRazorpayWebhookSignature } from "./signature";
import { emit } from "@/features/notifications/events";
import {
  classifyRazorpayEvent,
  orderIdFromNotes,
  parseRazorpayEvent,
  tenantIdFromNotes,
  webhookEventId,
  webhookIdempotency,
  type RazorpayPaymentEntity,
  type RazorpayRefundEntity,
  type WebhookAction,
} from "./webhook";

export type WebhookResponse = { status: number; body: Record<string, unknown> };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Permanent failures are acknowledged (200) so Razorpay stops retrying; transient ones return 500. */
function isPermanent(err: unknown): boolean {
  return err instanceof AppError && err.code !== "INTERNAL";
}

async function findOrderForPayment(admin: Admin, tenantId: string, payment: RazorpayPaymentEntity): Promise<string | null> {
  if (payment.order_id) {
    const { data } = await admin
      .from("payments")
      .select("order_id")
      .eq("tenant_id", tenantId)
      .eq("provider", "razorpay")
      .eq("provider_order_id", payment.order_id)
      .limit(1)
      .maybeSingle();
    if (data) return data.order_id;
  }
  // Fallback: the notes we attached when creating the Razorpay order (must name THIS tenant).
  const fromNotes = orderIdFromNotes(payment);
  if (!fromNotes || tenantIdFromNotes(payment) !== tenantId) return null;
  const { data: order } = await admin.from("orders").select("id").eq("tenant_id", tenantId).eq("id", fromNotes).maybeSingle();
  return order?.id ?? null;
}

async function applyMarkPaid(admin: Admin, tenantId: string, payment: RazorpayPaymentEntity): Promise<string> {
  const orderId = await findOrderForPayment(admin, tenantId, payment);
  if (!orderId) throw new AppError("NOT_FOUND", { context: { reason: "no order for razorpay payment", payment: payment.id } });
  const changed = await markOrderPaid({
    tenantId,
    orderId,
    provider: "razorpay",
    providerOrderId: payment.order_id ?? "",
    providerPaymentId: payment.id,
    amountMinor: payment.amount,
    method: payment.method ?? null,
  });
  return changed ? "order marked paid" : "order already paid";
}

async function applyCapture(admin: Admin, tenantId: string, creds: RazorpayCredentials, payment: RazorpayPaymentEntity): Promise<string> {
  const orderId = await findOrderForPayment(admin, tenantId, payment);
  if (!orderId) throw new AppError("NOT_FOUND", { context: { reason: "no order for razorpay payment", payment: payment.id } });
  const { data: order } = await admin.from("orders").select("grand_total, payment_status, status").eq("tenant_id", tenantId).eq("id", orderId).single();
  if (!order || order.payment_status === "paid") return "nothing to capture";
  if (toMinor(order.grand_total) !== payment.amount) throw new AppError("CONFLICT", { context: { hint: "AMOUNT_MISMATCH", payment: payment.id } });
  const captured = await captureRazorpayPayment(creds, payment.id, payment.amount);
  if (captured.status === "captured") {
    await markOrderPaid({ tenantId, orderId, provider: "razorpay", providerOrderId: payment.order_id ?? "", providerPaymentId: payment.id, amountMinor: captured.amount, method: captured.method });
    return "captured and marked paid";
  }
  return `capture returned ${captured.status}`;
}

async function applyPaymentFailed(admin: Admin, tenantId: string, payment: RazorpayPaymentEntity): Promise<string> {
  const orderId = await findOrderForPayment(admin, tenantId, payment);
  if (!orderId) return "no matching order";
  // The Razorpay order stays usable for a retry, so the payment row keeps status "created".
  await admin
    .from("payments")
    .update({ error_code: payment.error_code?.slice(0, 80) ?? null, error_description: payment.error_description?.slice(0, 300) ?? null })
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .eq("provider", "razorpay")
    .eq("provider_order_id", payment.order_id ?? "");
  await admin.from("order_events").insert({
    tenant_id: tenantId,
    order_id: orderId,
    type: "payment_failed",
    message: "A payment attempt failed",
    data: { payment_id: payment.id, code: payment.error_code ?? null },
    visible_to_customer: false,
  });
  // One "payment didn't go through" message per order (idempotency key), skipped once paid.
  emit({ type: "order.status_changed", tenantId, orderId, status: "payment_failed" });
  return "failure recorded";
}

async function applyRefund(admin: Admin, tenantId: string, refund: RazorpayRefundEntity): Promise<string> {
  const { data: row } = await admin.from("refunds").select("id, order_id, status").eq("tenant_id", tenantId).eq("provider_refund_id", refund.id).maybeSingle();
  if (row) {
    if (refund.status === "failed" && row.status !== "failed") {
      await admin.from("refunds").update({ status: "failed" }).eq("tenant_id", tenantId).eq("id", row.id);
      await admin.from("order_events").insert({
        tenant_id: tenantId,
        order_id: row.order_id,
        type: "refund_failed",
        message: "Razorpay reported this refund as failed. Refund the customer manually.",
        data: { refund_id: refund.id, amount: rupees(refund.amount) },
        visible_to_customer: false,
      });
      logger.error("refund.failed_at_provider", { tenantId, orderId: row.order_id, refundId: refund.id });
      return "refund marked failed";
    }
    return "refund already recorded";
  }
  if (refund.status !== "processed") return "refund not processed yet";
  // Refund issued from the Razorpay dashboard: record it so order totals stay in sync.
  const { data: payment } = await admin.from("payments").select("order_id").eq("tenant_id", tenantId).eq("provider", "razorpay").eq("provider_payment_id", refund.payment_id).maybeSingle();
  if (!payment) return "no matching payment";
  const { error } = await admin.rpc("svc_record_refund", {
    p_order: payment.order_id,
    p_amount: rupees(refund.amount),
    p_reason: "Refund issued in Razorpay",
    p_method: "original",
    p_provider_refund_id: refund.id,
    p_status: "processed",
    p_return: null as unknown as string,
    p_actor: null as unknown as string,
  });
  if (error) throw new AppError("CONFLICT", { context: { db: error.message, hint: error.hint } });
  return "external refund recorded";
}

async function apply(admin: Admin, tenantId: string, creds: RazorpayCredentials, action: WebhookAction): Promise<string> {
  switch (action.kind) {
    case "mark_paid":
      return applyMarkPaid(admin, tenantId, action.payment);
    case "capture":
      return applyCapture(admin, tenantId, creds, action.payment);
    case "payment_failed":
      return applyPaymentFailed(admin, tenantId, action.payment);
    case "refund":
      return applyRefund(admin, tenantId, action.refund);
    case "ignore":
      return `ignored: ${action.reason}`;
  }
}

/**
 * Razorpay webhook for the store whose host received it. Order of operations:
 * tenant from verified host -> tenant webhook secret -> HMAC over the RAW body -> parse ->
 * idempotency row in webhook_events -> idempotent state change -> mark processed.
 */
export async function handleRazorpayWebhook(input: { host: string | null; rawBody: string; signature: string | null; eventIdHeader: string | null }): Promise<WebhookResponse> {
  if (!input.host) return { status: 404, body: { error: "unknown store" } };
  const tenant = await tenantDirectory.findByHost(input.host);
  if (!tenant) return { status: 404, body: { error: "unknown store" } };

  const creds = await loadRazorpayCredentials(tenant.tenantId, { requireEnabled: false });
  if (!creds?.webhookSecret) {
    logger.warn("webhook.razorpay.not_configured", { tenantId: tenant.tenantId });
    return { status: 401, body: { error: "webhook not configured" } };
  }
  if (!verifyRazorpayWebhookSignature(input.rawBody, input.signature, creds.webhookSecret)) {
    logger.warn("webhook.razorpay.bad_signature", { tenantId: tenant.tenantId });
    return { status: 401, body: { error: "invalid signature" } };
  }

  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }
  const event = parseRazorpayEvent(json);
  if (!event) return { status: 200, body: { ok: true, ignored: "unrecognised payload" } };

  const admin = createSupabaseAdminClient();
  const eventId = webhookEventId(input.eventIdHeader, input.rawBody);
  const { error: insertError } = await admin.from("webhook_events").insert({ provider: "razorpay", event_id: eventId, tenant_id: tenant.tenantId, event_type: event.event });
  if (insertError) {
    if (insertError.code !== "23505") {
      logger.error("webhook.razorpay.record_failed", { tenantId: tenant.tenantId, error: insertError.message });
      return { status: 500, body: { error: "temporary failure" } };
    }
    const { data: existing } = await admin.from("webhook_events").select("processed_at, tenant_id").eq("provider", "razorpay").eq("event_id", eventId).maybeSingle();
    if (existing?.tenant_id && existing.tenant_id !== tenant.tenantId) return { status: 200, body: { ok: true, duplicate: true } };
    if (webhookIdempotency(existing ?? null) === "duplicate") return { status: 200, body: { ok: true, duplicate: true } };
  }

  const done = (error: string | null) =>
    admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), error })
      .eq("provider", "razorpay")
      .eq("event_id", eventId);

  try {
    const outcome = await apply(admin, tenant.tenantId, creds, classifyRazorpayEvent(event));
    await done(null);
    logger.info("webhook.razorpay.processed", { tenantId: tenant.tenantId, event: event.event, outcome });
    return { status: 200, body: { ok: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "error";
    if (isPermanent(err)) {
      await done(message);
      logger.warn("webhook.razorpay.rejected", { tenantId: tenant.tenantId, event: event.event, error: err, context: err instanceof AppError ? err.context : undefined });
      return { status: 200, body: { ok: true, rejected: true } };
    }
    await admin.from("webhook_events").update({ error: message }).eq("provider", "razorpay").eq("event_id", eventId);
    logger.error("webhook.razorpay.failed", { tenantId: tenant.tenantId, event: event.event, error: err });
    return { status: 500, body: { error: "temporary failure" } };
  }
}
