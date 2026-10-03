import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { randomToken } from "@/lib/crypto";
import { markOrderPaid, rupees } from "@/features/checkout/post-order";
import { isManualProviderEnabled, loadCashfreeCredentials, loadPayuCredentials, loadRazorpayCredentials } from "./credentials";
import { createCashfreeRefund } from "./cashfree";
import { refundPayu } from "./payu";
import { createRazorpayOrder, createRazorpayRefund } from "./razorpay";

/**
 * Payment provider abstraction (ADR-020). COD is built in, Razorpay is the first online
 * adapter, and "manual" is a TEST-ONLY provider that marks online orders paid instantly —
 * it refuses to run when NODE_ENV === "production".
 */
export type PaymentProviderId = "cod" | "razorpay" | "cashfree" | "payu" | "manual";

export type OrderForPayment = { id: string; tenantId: string; orderNumber: number; grandTotalMinor: number; email: string | null; phone: string };

export type PaymentInit =
  /** nothing to collect now (COD) */
  | { kind: "none" }
  /** shopper must complete payment on /checkout/pay */
  | { kind: "pay_page"; providerOrderId: string }
  /** already captured (manual test provider) */
  | { kind: "paid" };

export type RefundInput = { order: { id: string; tenantId: string; orderNumber: number }; providerPaymentId: string | null; providerOrderId?: string | null; amountMinor: number; reason: string };
export type RefundOutput = { method: "original" | "manual"; providerRefundId: string | null; status: "processed" | "pending" };

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  initiate(order: OrderForPayment): Promise<PaymentInit>;
  refund(input: RefundInput): Promise<RefundOutput>;
}

export const codProvider: PaymentProvider = {
  id: "cod",
  label: "Cash on Delivery",
  async initiate() {
    return { kind: "none" };
  },
  async refund() {
    // COD money was collected by the courier; the seller refunds out of band (UPI/bank).
    return { method: "manual", providerRefundId: null, status: "processed" };
  },
};

export const razorpayProvider: PaymentProvider = {
  id: "razorpay",
  label: "Pay online (UPI, cards, netbanking)",
  async initiate(order) {
    const admin = createSupabaseAdminClient();
    // Idempotent: reuse the provider order created by an earlier attempt for this order.
    const { data: existing } = await admin
      .from("payments")
      .select("provider_order_id")
      .eq("tenant_id", order.tenantId)
      .eq("order_id", order.id)
      .eq("provider", "razorpay")
      .eq("status", "created")
      .not("provider_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.provider_order_id) return { kind: "pay_page", providerOrderId: existing.provider_order_id };

    const creds = await loadRazorpayCredentials(order.tenantId);
    if (!creds) throw new AppError("CONFLICT", { message: "Online payment isn't available right now. Please choose another method." });
    const rzp = await createRazorpayOrder(creds, {
      amountMinor: order.grandTotalMinor,
      receipt: `order_${order.orderNumber}`,
      notes: { order_id: order.id, tenant_id: order.tenantId },
    });
    if (rzp.amount !== order.grandTotalMinor) throw new AppError("INTERNAL", { context: { reason: "razorpay amount mismatch" } });
    const { error } = await admin.from("payments").insert({
      tenant_id: order.tenantId,
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: rzp.id,
      amount: rupees(order.grandTotalMinor),
      status: "created",
    });
    if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
    return { kind: "pay_page", providerOrderId: rzp.id };
  },
  async refund(input) {
    if (!input.providerPaymentId) throw new AppError("CONFLICT", { message: "No captured online payment was found for this order." });
    const creds = await loadRazorpayCredentials(input.order.tenantId, { requireEnabled: false });
    if (!creds) throw new AppError("CONFLICT", { message: "Razorpay credentials are missing, so the refund can't be sent. Refund manually instead." });
    const refund = await createRazorpayRefund(creds, input.providerPaymentId, {
      amountMinor: input.amountMinor,
      notes: { order_id: input.order.id, reason: input.reason.slice(0, 200) },
      receipt: `refund_${input.order.orderNumber}_${Date.now()}`,
    });
    if (refund.status === "failed") throw new AppError("CONFLICT", { message: "Razorpay could not process this refund." });
    return { method: "original", providerRefundId: refund.id, status: "processed" };
  },
};

/**
 * Cashfree and PayU start on the pay page (features/payments/gateways.ts), where the shopper picks
 * a gateway; these objects carry their refund implementations for the dashboard refund flow.
 */
export const cashfreeProvider: PaymentProvider = {
  id: "cashfree",
  label: "Cashfree",
  async initiate() {
    return { kind: "none" };
  },
  async refund(input) {
    if (!input.providerOrderId) throw new AppError("CONFLICT", { message: "No Cashfree order was found for this payment." });
    const creds = await loadCashfreeCredentials(input.order.tenantId, { requireEnabled: false });
    if (!creds) throw new AppError("CONFLICT", { message: "Cashfree credentials are missing, so the refund can't be sent. Refund manually instead." });
    const refundId = `rf_${input.order.orderNumber}_${Date.now()}`.slice(0, 40);
    const r = await createCashfreeRefund(creds, input.providerOrderId, { refundId, amountRupees: input.amountMinor / 100, note: input.reason });
    return { method: "original", providerRefundId: String(r.cf_refund_id ?? refundId), status: r.refund_status === "SUCCESS" ? "processed" : "pending" };
  },
};

export const payuProvider: PaymentProvider = {
  id: "payu",
  label: "PayU",
  async initiate() {
    return { kind: "none" };
  },
  async refund(input) {
    if (!input.providerPaymentId) throw new AppError("CONFLICT", { message: "No PayU payment id was found for this order." });
    const creds = await loadPayuCredentials(input.order.tenantId, { requireEnabled: false });
    if (!creds) throw new AppError("CONFLICT", { message: "PayU credentials are missing, so the refund can't be sent. Refund manually instead." });
    const token = `rf${input.order.orderNumber}${Date.now()}`.slice(0, 30);
    const r = await refundPayu(creds, input.providerPaymentId, token, input.amountMinor / 100);
    return { method: "original", providerRefundId: String(r.request_id ?? token), status: "pending" };
  },
};

/** DEVELOPMENT/TEST ONLY. Never enabled in production builds or production env. */
export const manualTestProvider: PaymentProvider = {
  id: "manual",
  label: "Test payment (development only — no money moves)",
  async initiate(order) {
    if (!isManualProviderEnabled()) throw new AppError("FORBIDDEN", { context: { reason: "manual provider disabled in production" } });
    await markOrderPaid({
      tenantId: order.tenantId,
      orderId: order.id,
      provider: "manual",
      providerOrderId: `manual_order_${order.id}`,
      providerPaymentId: `manual_pay_${randomToken(9)}`,
      amountMinor: order.grandTotalMinor,
      method: "test",
    });
    return { kind: "paid" };
  },
  async refund() {
    if (!isManualProviderEnabled()) throw new AppError("FORBIDDEN");
    return { method: "original", providerRefundId: `manual_rfnd_${randomToken(9)}`, status: "processed" };
  },
};

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  switch (id) {
    case "cod":
      return codProvider;
    case "razorpay":
      return razorpayProvider;
    case "cashfree":
      return cashfreeProvider;
    case "payu":
      return payuProvider;
    case "manual":
      if (!isManualProviderEnabled()) throw new AppError("FORBIDDEN");
      return manualTestProvider;
  }
}
