import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { markOrderPaid } from "@/features/checkout/post-order";
import { orderIdFromToken, orderPath } from "@/features/checkout/order-access";
import { formatOrderNumber } from "@/features/checkout/settings";
import { isManualProviderEnabled, loadRazorpayCredentials, onlinePaymentProviders } from "./credentials";
import { getPaymentProvider } from "./provider";
import { captureRazorpayPayment, fetchRazorpayPayment } from "./razorpay";
import { verifyRazorpayPaymentSignature } from "./signature";

/**
 * Online payment step (/checkout/pay?t=<signed order token>). The token proves the browser
 * placed (or was sent) this order; the order is always loaded with the host-resolved tenant.
 */

type PayOrder = { id: string; number: string; grandTotal: number; email: string | null; phone: string; name: string | null };

export type GatewayOption = { id: "razorpay" | "cashfree" | "payu"; label: string; description: string };
const GATEWAY_LABELS: Record<GatewayOption["id"], Omit<GatewayOption, "id">> = {
  razorpay: { label: "Razorpay", description: "UPI, cards, net banking and wallets" },
  cashfree: { label: "Cashfree", description: "UPI, cards, net banking, wallets and pay later" },
  payu: { label: "PayU", description: "UPI, cards, net banking and EMI" },
};

export type PayPageState =
  | { state: "choose"; order: PayOrder; storeName: string; gateways: GatewayOption[]; expiresAt: string | null; lastError: string | null }
  | { state: "manual"; order: PayOrder; expiresAt: string | null }
  | { state: "paid"; redirectTo: string }
  | { state: "expired"; order: PayOrder }
  | { state: "unavailable"; order: PayOrder; message: string };

async function loadPendingOrder(tenantId: string, token: string) {
  const orderId = orderIdFromToken(token);
  if (!orderId) return null;
  const admin = createSupabaseAdminClient();
  const { data: o } = await admin
    .from("orders")
    .select("id, order_number, grand_total, email, phone, status, payment_status, payment_method, shipping_address")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  return o;
}

export async function loadPayPage(tenantId: string, storeName: string, token: string): Promise<PayPageState | null> {
  const o = await loadPendingOrder(tenantId, token);
  if (!o) return null;
  const admin = createSupabaseAdminClient();
  const { data: store } = await admin.from("stores").select("order_prefix").eq("tenant_id", tenantId).maybeSingle();
  const address = (o.shipping_address ?? {}) as { name?: unknown };
  const order: PayOrder = {
    id: o.id,
    number: formatOrderNumber(store?.order_prefix ?? "#", o.order_number),
    grandTotal: toMinor(o.grand_total),
    email: o.email,
    phone: o.phone,
    name: typeof address.name === "string" ? address.name : null,
  };
  if (o.payment_status === "paid" || o.payment_method !== "online" || o.status === "confirmed" || o.status === "completed") {
    return { state: "paid", redirectTo: orderPath(o.id) };
  }
  if (o.status === "cancelled" || o.payment_status === "expired" || o.payment_status === "failed") return { state: "expired", order };

  const { data: reservation } = await admin
    .from("inventory_reservations")
    .select("expires_at")
    .eq("tenant_id", tenantId)
    .eq("order_id", o.id)
    .eq("status", "active")
    .order("expires_at")
    .limit(1)
    .maybeSingle();
  const expiresAt = reservation?.expires_at ?? null;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return { state: "expired", order };

  const providers = (await onlinePaymentProviders(tenantId)).filter((p): p is GatewayOption["id"] => p !== "manual");
  if (!providers.length) {
    if (isManualProviderEnabled()) return { state: "manual", order, expiresAt };
    return { state: "unavailable", order, message: "Online payment isn't available right now. Please contact the store or place a new order with Cash on Delivery." };
  }
  const { data: attempt } = await admin
    .from("payments")
    .select("error_description")
    .eq("tenant_id", tenantId)
    .eq("order_id", o.id)
    .not("error_description", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    state: "choose",
    order,
    storeName,
    gateways: providers.map((id) => ({ id, ...GATEWAY_LABELS[id] })),
    expiresAt,
    lastError: attempt?.error_description ?? null,
  };
}

export type ConfirmOutcome = { redirectTo: string; status: "paid" | "processing" };

/**
 * Razorpay Checkout success callback. The signature (HMAC with the tenant key secret over
 * order_id|payment_id) proves Razorpay issued this payment for OUR Razorpay order; we then check
 * that Razorpay order belongs to the token's order, and read the payment from the API so an
 * authorised-but-not-captured payment is captured before the order is marked paid.
 */
export async function confirmRazorpayPayment(
  tenantId: string,
  input: { token: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string },
): Promise<ConfirmOutcome> {
  const o = await loadPendingOrder(tenantId, input.token);
  if (!o) throw new AppError("NOT_FOUND");
  if (o.payment_status === "paid") return { redirectTo: orderPath(o.id), status: "paid" };

  const creds = await loadRazorpayCredentials(tenantId, { requireEnabled: false });
  if (!creds) throw new AppError("CONFLICT", { message: "Online payment isn't configured for this store." });
  const valid = verifyRazorpayPaymentSignature({ orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.signature, keySecret: creds.keySecret });
  if (!valid) throw new AppError("VALIDATION", { message: "We couldn't verify this payment. If money was debited, it will be confirmed automatically or refunded." });

  const admin = createSupabaseAdminClient();
  const { data: attempt } = await admin
    .from("payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("order_id", o.id)
    .eq("provider", "razorpay")
    .eq("provider_order_id", input.razorpayOrderId)
    .maybeSingle();
  if (!attempt) throw new AppError("FORBIDDEN", { context: { reason: "razorpay order does not belong to this order" } });

  const processing: ConfirmOutcome = { redirectTo: `${orderPath(o.id)}&payment=processing`, status: "processing" };
  try {
    let payment = await fetchRazorpayPayment(creds, input.razorpayPaymentId);
    if (payment.order_id !== input.razorpayOrderId) throw new AppError("FORBIDDEN", { context: { reason: "payment/order mismatch" } });
    if (payment.status === "authorized") {
      if (payment.amount !== toMinor(o.grand_total)) throw new AppError("CONFLICT", { context: { hint: "AMOUNT_MISMATCH" } });
      payment = await captureRazorpayPayment(creds, payment.id, payment.amount);
    }
    if (payment.status !== "captured") return processing;
    await markOrderPaid({ tenantId, orderId: o.id, provider: "razorpay", providerOrderId: input.razorpayOrderId, providerPaymentId: payment.id, amountMinor: payment.amount, method: payment.method });
    return { redirectTo: `${orderPath(o.id)}&placed=1`, status: "paid" };
  } catch (err) {
    if (err instanceof AppError && (err.code === "FORBIDDEN" || err.code === "CONFLICT")) throw err;
    // Provider unreachable: the payment.captured webhook will confirm the order.
    logger.warn("payments.confirm_deferred", { tenantId, orderId: o.id, error: err });
    return processing;
  }
}

/** DEVELOPMENT ONLY: completes an online order with the manual test provider. */
export async function completeTestPayment(tenantId: string, token: string): Promise<ConfirmOutcome> {
  if (!isManualProviderEnabled()) throw new AppError("FORBIDDEN");
  const o = await loadPendingOrder(tenantId, token);
  if (!o) throw new AppError("NOT_FOUND");
  if (o.status === "cancelled") throw new AppError("CONFLICT", { message: "This order has expired." });
  if (o.payment_status !== "paid") {
    await getPaymentProvider("manual").initiate({ id: o.id, tenantId, orderNumber: o.order_number, grandTotalMinor: toMinor(o.grand_total), email: o.email, phone: o.phone });
  }
  return { redirectTo: `${orderPath(o.id)}&placed=1`, status: "paid" };
}
