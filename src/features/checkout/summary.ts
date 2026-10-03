import type { CartLine } from "@/features/cart/lines";
import type { PricingResult } from "./pricing";

/**
 * Serializable checkout/cart summary for client components. Built from a server-side quote,
 * so every amount (paise) comes from CURRENT DB prices, never from the browser.
 */
export type SummaryLine = {
  id: string;
  variantId: string;
  productSlug: string;
  title: string;
  variantTitle: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  quantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  discount: number;
  total: number;
};

export type SummaryRate = { id: string; name: string; price: number; originalPrice: number; daysMin: number; daysMax: number; codAllowed: boolean };

export type SummaryIssue = { lineId: string; title: string; kind: "unavailable" | "out_of_stock" | "insufficient_stock"; maxQuantity: number };

export type CheckoutSummary = {
  lines: SummaryLine[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  codFee: number;
  taxTotal: number;
  grandTotal: number;
  pricesIncludeTax: boolean;
  discount: { code: string | null; title: string | null; amount: number; freeShipping: boolean; automatic: boolean } | null;
  codeMessage: string | null;
  shipping: { serviceable: boolean; pincodeChecked: boolean; rates: SummaryRate[]; selectedId: string | null };
  cod: { available: boolean; reason: string | null; fee: number };
  issues: SummaryIssue[];
};

type QuoteLike = {
  pricing: PricingResult;
  discount: { code: string | null; title?: string } | null;
  codeMessage: string | null;
  issues: { lineId: string; kind: SummaryIssue["kind"]; maxQuantity: number }[];
  priced: readonly CartLine[];
};

export function toCheckoutSummary(quote: QuoteLike, allLines: readonly CartLine[] = quote.priced): CheckoutSummary {
  const p = quote.pricing;
  const byVariant = new Map(p.lines.map((l) => [l.key, l]));
  const titles = new Map(allLines.map((l) => [l.id, l.productTitle]));
  return {
    lines: quote.priced.map((l) => {
      const priced = byVariant.get(l.variantId);
      return {
        id: l.id,
        variantId: l.variantId,
        productSlug: l.productSlug,
        title: l.productTitle,
        variantTitle: l.variantTitle ?? (l.options.map((o) => o.value).join(" / ") || null),
        imagePath: l.imagePath,
        imageAlt: l.imageAlt,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        compareAtPrice: l.compareAtPrice,
        discount: priced?.discount ?? 0,
        total: priced?.total ?? l.unitPrice * l.quantity,
      };
    }),
    itemCount: p.itemCount,
    subtotal: p.subtotal,
    discountTotal: p.discountTotal,
    shippingTotal: p.shippingTotal,
    codFee: p.codFee,
    taxTotal: p.taxTotal,
    grandTotal: p.grandTotal,
    pricesIncludeTax: p.pricesIncludeTax,
    discount:
      p.discount.status === "applied" && quote.discount
        ? { code: p.discount.code, title: quote.discount.title ?? null, amount: p.discount.amount, freeShipping: p.discount.freeShipping, automatic: p.discount.code === null }
        : null,
    codeMessage: quote.codeMessage,
    shipping: {
      serviceable: p.shipping.serviceable,
      pincodeChecked: p.shipping.pincodeChecked,
      rates: p.shipping.rates.map((r) => ({ id: r.id, name: r.name, price: r.price, originalPrice: r.originalPrice, daysMin: r.estimatedDaysMin, daysMax: r.estimatedDaysMax, codAllowed: r.codAllowed })),
      selectedId: p.shipping.selected?.id ?? null,
    },
    cod: p.cod,
    issues: quote.issues.map((i) => ({ ...i, title: titles.get(i.lineId) ?? "An item" })),
  };
}

/** Human delivery estimate, e.g. "3–6 days". */
export function deliveryEstimate(daysMin: number, daysMax: number): string {
  if (daysMin === daysMax) return `${daysMin} day${daysMin === 1 ? "" : "s"}`;
  return `${daysMin}–${daysMax} days`;
}
