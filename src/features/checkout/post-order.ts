import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { emit } from "@/features/notifications/events";
import { trackCommerceEvent } from "./analytics";
import { rupees } from "./order-payload";

export { rupees };

/**
 * Side effects once an order is confirmed (COD at placement, online on capture): issue the
 * GST invoice, email the shopper, record the purchase event. Each step is best-effort.
 */
export async function afterOrderConfirmed(tenantId: string, orderId: string, reason: "cod" | "paid"): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("orders").select("id, status, grand_total, customer_id, cart_id").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (!order || order.status !== "confirmed") return;
  const { error } = await admin.rpc("svc_issue_invoice", { p_order: orderId });
  if (error) logger.error("invoice.issue_failed", { tenantId, orderId, error: error.message });
  // Customer confirmation + store alert (email, WhatsApp) run after the response.
  emit({ type: "order.placed", tenantId, orderId, payment: reason });
  await trackCommerceEvent(tenantId, "purchase", { orderId, customerId: order.customer_id, cartId: order.cart_id, valueMinor: toMinor(order.grand_total), metadata: { payment: reason } });
}

/**
 * Marks an online order paid after the payment was VERIFIED (checkout signature or webhook
 * signature). Enforces that the order belongs to `tenantId` before calling the service-role RPC
 * (which itself re-checks the amount and is idempotent). Returns true when state changed.
 */
export async function markOrderPaid(input: {
  tenantId: string;
  orderId: string;
  provider: "razorpay" | "cashfree" | "payu" | "manual";
  providerOrderId: string;
  providerPaymentId: string;
  amountMinor: number;
  method: string | null;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("orders").select("id").eq("tenant_id", input.tenantId).eq("id", input.orderId).maybeSingle();
  if (!order) throw new AppError("NOT_FOUND", { context: { orderId: input.orderId } });
  const { data: changed, error } = await admin.rpc("svc_mark_order_paid", {
    p_order: input.orderId,
    p_provider: input.provider,
    p_provider_order_id: input.providerOrderId,
    p_provider_payment_id: input.providerPaymentId,
    p_amount: rupees(input.amountMinor),
    p_method: (input.method ?? "online").slice(0, 40),
  });
  if (error) throw mapDbError(error, { orderId: input.orderId });
  if (changed) await afterOrderConfirmed(input.tenantId, input.orderId, "paid");
  return Boolean(changed);
}
