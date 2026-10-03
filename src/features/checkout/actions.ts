"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { requireStoreTenant } from "@/features/cart/context";
import { resolveCart } from "@/features/cart/service";
import { loadCartLines } from "@/features/cart/lines";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { completeTestPayment, confirmRazorpayPayment } from "@/features/payments/checkout";
import { startGatewayPayment, type GatewayStart } from "@/features/payments/gateways";
import { onlinePaymentProviders } from "@/features/payments/credentials";
import { placeOrder } from "./place-order";
import { quoteCart } from "./quote";
import { orderTokenSchema, placeholderSafe, quoteSchema, razorpayConfirmSchema, checkoutSchema } from "./schemas";
import { toCheckoutSummary, type CheckoutSummary } from "./summary";

/** Live re-quote for the checkout page (PIN / shipping method / payment method changes). Read-only. */
export async function quoteCheckoutAction(raw: { postalCode?: string; shippingRateId?: string; paymentMethod?: string }): Promise<ActionResult<CheckoutSummary>> {
  return runAction("checkout.quote", async () => {
    const input = parseInput(quoteSchema, placeholderSafe(raw));
    await rateLimit("checkout:quote", await clientIpKey(), 90, 60);
    const tenant = await requireStoreTenant();
    const cart = await resolveCart(tenant.tenantId);
    const lines = cart ? (await loadCartLines(tenant.tenantId, cart.id)).filter((l) => !l.savedForLater) : [];
    const quote = await quoteCart(tenant.tenantId, cart, lines, {
      pincode: input.postalCode || null,
      shippingRateId: input.shippingRateId ?? null,
      paymentMethod: input.paymentMethod ?? null,
    });
    return toCheckoutSummary(quote, lines);
  });
}

/**
 * Places the order. validate -> rate limit (IP) -> tenant from verified host -> placeOrder
 * (re-prices from the DB, svc_place_order) -> redirect to payment or confirmation.
 */
export async function placeOrderAction(_prev: ActionResult<{ redirectTo: string }> | null, fd: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const result = await runAction("checkout.placeOrder", async () => {
    const input = parseInput(checkoutSchema, formToObject(fd));
    await rateLimit("checkout:place:ip", await clientIpKey(), 12, 600);
    await rateLimit("checkout:place:email", input.email, 8, 600);
    const tenant = await requireStoreTenant();
    const placed = await placeOrder(tenant, input);
    return { redirectTo: placed.redirectTo };
  });
  if (result.ok) redirect(result.data.redirectTo);
  return result;
}

/** Relays Razorpay Checkout's success callback; verified server-side before anything changes. */
export async function confirmRazorpayPaymentAction(raw: Record<string, string>): Promise<ActionResult<{ redirectTo: string; status: "paid" | "processing" }>> {
  return runAction("checkout.confirmPayment", async () => {
    const input = parseInput(razorpayConfirmSchema, raw);
    await rateLimit("checkout:confirm", await clientIpKey(), 30, 600);
    const tenant = await requireStoreTenant();
    return confirmRazorpayPayment(tenant.tenantId, {
      token: input.t,
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
    });
  });
}

/** Starts the shopper's chosen gateway for an unpaid online order (tenant = verified host). */
export async function startGatewayPaymentAction(raw: { t: string; provider: string }): Promise<ActionResult<GatewayStart>> {
  return runAction("checkout.startGateway", async () => {
    const input = parseInput(z.object({ t: z.string().min(10).max(500), provider: z.enum(["razorpay", "cashfree", "payu"]) }), raw);
    await rateLimit("checkout:gateway", await clientIpKey(), 30, 600);
    const tenant = await requireStoreTenant();
    const available = await onlinePaymentProviders(tenant.tenantId);
    if (!available.includes(input.provider)) throw new AppError("CONFLICT", { message: "That payment option isn't available. Please choose another." });
    return startGatewayPayment(tenant.tenantId, tenant.host, input.t, input.provider);
  });
}

/** Development-only test payment (the manual provider refuses to run in production). */
export async function completeTestPaymentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target = "/";
  const result = await runAction("checkout.testPayment", async () => {
    const input = parseInput(orderTokenSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    target = (await completeTestPayment(tenant.tenantId, input.t)).redirectTo;
  });
  if (result.ok) redirect(target);
  return result;
}
