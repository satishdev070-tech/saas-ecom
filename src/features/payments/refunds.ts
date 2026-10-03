import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { assertPermission, type TenantContext } from "@/lib/tenant/membership";
import { AppError } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { rupees } from "@/features/checkout/post-order";
import { emit } from "@/features/notifications/events";
import { getPaymentProvider, type PaymentProviderId } from "./provider";

const refundInput = z.object({
  orderId: z.uuid(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(1, "Enter a reason").max(500),
  returnId: z.uuid().optional().nullable(),
});

export type RefundResult = { refundId: string; method: "original" | "manual"; providerRefundId: string | null };

/**
 * Refunds part or all of an order (called by the seller dashboard; D builds the UI).
 * validate -> authorize (orders.refund) -> check remaining refundable amount -> provider refund
 * (Razorpay for captured online payments; recorded as manual for COD) -> svc_record_refund ->
 * payment row status -> audit -> notify. Throws AppError (wrap the caller in runAction).
 */
export async function refundOrder(args: { ctx: TenantContext; orderId: string; amountMinor: number; reason: string; returnId?: string | null }): Promise<RefundResult> {
  const input = refundInput.parse({ orderId: args.orderId, amountMinor: args.amountMinor, reason: args.reason, returnId: args.returnId ?? null });
  const { ctx } = args;
  assertPermission(ctx, "orders.refund");

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, order_number, payment_method, payment_status, grand_total, refunded_total")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) throw new AppError("NOT_FOUND");
  if (!["paid", "partially_refunded"].includes(order.payment_status)) {
    throw new AppError("CONFLICT", { message: "Only paid orders can be refunded." });
  }
  const remaining = toMinor(order.grand_total) - toMinor(order.refunded_total);
  if (input.amountMinor > remaining) throw new AppError("VALIDATION", { fieldErrors: { amount: ["The refund exceeds the amount still refundable."] } });

  if (input.returnId) {
    const { data: ret } = await admin.from("returns").select("id").eq("tenant_id", ctx.tenantId).eq("order_id", order.id).eq("id", input.returnId).maybeSingle();
    if (!ret) throw new AppError("NOT_FOUND", { message: "That return doesn't belong to this order." });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id, provider, provider_order_id, provider_payment_id, amount, status")
    .eq("tenant_id", ctx.tenantId)
    .eq("order_id", order.id)
    .in("status", ["captured", "partially_refunded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const providerId: PaymentProviderId = (["razorpay", "cashfree", "payu", "manual"] as const).find((p) => p === payment?.provider) ?? "cod";
  const provider = getPaymentProvider(providerId);
  const refund = await provider.refund({
    order: { id: order.id, tenantId: ctx.tenantId, orderNumber: order.order_number },
    providerPaymentId: payment?.provider_payment_id ?? null,
    providerOrderId: payment?.provider_order_id ?? null,
    amountMinor: input.amountMinor,
    reason: input.reason,
  });

  const { data: refundId, error } = await admin.rpc("svc_record_refund", {
    p_order: order.id,
    p_amount: rupees(input.amountMinor),
    p_reason: input.reason,
    p_method: refund.method,
    p_provider_refund_id: refund.providerRefundId as string,
    p_status: refund.status,
    p_return: input.returnId as string,
    p_actor: ctx.user.id,
  });
  if (error || !refundId) {
    // Money may already have moved at the provider: log loudly; the refund.processed webhook reconciles.
    logger.error("refund.record_failed", { tenantId: ctx.tenantId, orderId: order.id, providerRefundId: refund.providerRefundId, error: error?.message });
    throw error ? mapDbError(error, { orderId: order.id }) : new AppError("INTERNAL");
  }

  if (payment) {
    const refundedAfter = toMinor(order.refunded_total) + input.amountMinor;
    await admin
      .from("payments")
      .update({ status: refundedAfter >= toMinor(payment.amount) ? "refunded" : "partially_refunded" })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", payment.id);
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "order.refunded",
    entityType: "order",
    entityId: order.id,
    metadata: { amount_minor: input.amountMinor, method: refund.method, provider_refund_id: refund.providerRefundId, return_id: input.returnId ?? null },
  });
  emit({ type: "order.status_changed", tenantId: ctx.tenantId, orderId: order.id, status: "refunded", refundAmountMinor: input.amountMinor, refundId: String(refundId) });
  return { refundId, method: refund.method, providerRefundId: refund.providerRefundId };
}
