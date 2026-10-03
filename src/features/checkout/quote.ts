import "server-only";
import type { CartLine } from "@/features/cart/lines";
import type { CartRecord } from "@/features/cart/service";
import { findDiscountByCode, loadAutomaticDiscounts } from "./discounts";
import { loadCheckoutSettings, type CheckoutSettings } from "./settings";
import { priceCart, type DiscountDefinition, type PaymentMethod, type PricingInput, type PricingResult } from "./pricing";

export type QuoteOptions = { pincode?: string | null; shippingRateId?: string | null; paymentMethod?: PaymentMethod | null };

export type LineIssue = { lineId: string; kind: "unavailable" | "out_of_stock" | "insufficient_stock"; maxQuantity: number };

export type Quote = {
  pricing: PricingResult;
  settings: CheckoutSettings;
  discount: DiscountDefinition | null;
  /** message when the cart's code is invalid/expired/not applicable */
  codeMessage: string | null;
  /** lines that block checkout (removed from pricing) */
  issues: LineIssue[];
  /** lines that were priced */
  priced: CartLine[];
};

export function lineIssues(lines: readonly CartLine[]): LineIssue[] {
  const issues: LineIssue[] = [];
  for (const l of lines) {
    if (!l.purchasable) issues.push({ lineId: l.id, kind: "unavailable", maxQuantity: 0 });
    else if (!l.inStock || l.maxQuantity < 1) issues.push({ lineId: l.id, kind: "out_of_stock", maxQuantity: 0 });
    else if (l.quantity > l.maxQuantity) issues.push({ lineId: l.id, kind: "insufficient_stock", maxQuantity: l.maxQuantity });
  }
  return issues;
}

/**
 * Prices the cart from CURRENT DB data. Used by the cart page, the checkout page and the
 * place-order action, so what the shopper sees is exactly what the order is created with.
 */
export async function quoteCart(tenantId: string, cart: CartRecord | null, lines: readonly CartLine[], options: QuoteOptions = {}): Promise<Quote> {
  const settings = await loadCheckoutSettings(tenantId);
  const issues = lineIssues(lines);
  const blocked = new Set(issues.map((i) => i.lineId));
  const priced = lines.filter((l) => !blocked.has(l.id));

  const base: Omit<PricingInput, "discount"> = {
    lines: priced.map((l) => ({ key: l.variantId, productId: l.productId, collectionIds: l.collectionIds, unitPrice: l.unitPrice, quantity: l.quantity, weightGrams: l.weightGrams })),
    shippingRates: settings.shippingRates,
    pincodeRules: settings.pincodeRules,
    pincode: options.pincode ?? null,
    selectedShippingRateId: options.shippingRateId ?? null,
    paymentMethod: options.paymentMethod ?? null,
    cod: settings.cod,
    tax: settings.tax,
  };

  let discount: DiscountDefinition | null = null;
  let codeMessage: string | null = null;
  let pricing: PricingResult;

  if (cart?.discountCode) {
    discount = await findDiscountByCode(tenantId, cart.discountCode);
    if (!discount) codeMessage = "This code is invalid or has expired.";
    pricing = priceCart({ ...base, discount });
    if (pricing.discount.status === "rejected") codeMessage = pricing.discount.message;
  } else {
    // No code: apply the single best automatic discount, if any.
    pricing = priceCart(base);
    const automatic = priced.length ? await loadAutomaticDiscounts(tenantId) : [];
    for (const candidate of automatic) {
      const attempt = priceCart({ ...base, discount: candidate });
      if (attempt.discount.status === "applied" && attempt.grandTotal < pricing.grandTotal) {
        pricing = attempt;
        discount = candidate;
      }
    }
  }
  if (pricing.discount.status !== "applied") discount = null;
  return { pricing, settings, discount, codeMessage, issues, priced };
}
