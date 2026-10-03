import { z } from "zod";
import { email, indianMobile, pincode, uuid } from "@/lib/validation/common";
import { addressSchema } from "@/features/customer-account/address";

const bool = z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean());

/** Shipping rate ids are uuids, or "default" for stores without configured rates. */
const shippingRateId = z.union([uuid, z.literal("default")]);

/**
 * Checkout form. Prices, totals and the tenant are NEVER taken from here: the server re-prices
 * the cart from current DB data. `expectedTotal` is only the total the shopper was shown, so a
 * silent change between render and submit can be surfaced as "prices changed".
 */
export const checkoutSchema = addressSchema.extend({
  email,
  contactPhone: indianMobile,
  shippingRateId: shippingRateId.optional(),
  paymentMethod: z.enum(["cod", "online"], { message: "Choose a payment method" }),
  acceptsMarketing: bool.default(false),
  whatsappOptIn: bool.default(false),
  saveAddress: bool.default(false),
  note: z.string().trim().max(500, "Keep the note under 500 characters").optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, "Please reload the page and try again"),
  expectedTotal: z.coerce.number().int().nonnegative().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Live re-quote while the shopper edits PIN / shipping method / payment method. */
export const quoteSchema = z.object({
  postalCode: z.union([pincode, z.literal("")]).optional(),
  shippingRateId: shippingRateId.optional(),
  paymentMethod: z.enum(["cod", "online"]).optional(),
});

/** Razorpay Checkout success callback, relayed by the browser (verified server-side). */
export const razorpayConfirmSchema = z.object({
  t: z.string().min(10).max(400),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const paymentFailureSchema = z.object({
  t: z.string().min(10).max(400),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
});

export const orderTokenSchema = z.object({ t: z.string().min(10).max(400) });

/** Trims string fields and treats blank / placeholder-only values as missing before zod parsing. */
export function placeholderSafe(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      const t = v.trim();
      out[k] = t === "" ? undefined : t;
    } else out[k] = v;
  }
  return out;
}
