import { formatMoney } from "@/lib/money";
import type { CheckoutSummary } from "@/features/checkout/summary";
import { StoreImage } from "@/features/storefront/components/store-image";

/** Totals panel shared by cart and checkout (amounts in paise). */
export function OrderSummary({ summary, showLines = true }: { summary: CheckoutSummary; showLines?: boolean }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-medium" : "text-sm"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <div className="space-y-4">
      {showLines ? (
        <ul className="space-y-3">
          {summary.lines.map((l) => (
            <li key={l.id} className="flex gap-3">
              <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded">
                <StoreImage path={l.imagePath} alt={l.imageAlt ?? ""} sizes="56px" />
                <span className="absolute -right-1 -top-1 rounded-full bg-[var(--sf-primary)] px-1.5 text-[10px] text-[var(--sf-primary-fg)]">{l.quantity}</span>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2">{l.title}</p>
                {l.variantTitle ? <p className="sf-muted text-xs">{l.variantTitle}</p> : null}
              </div>
              <p className="text-sm tabular-nums">{formatMoney(l.total)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="sf-border space-y-2 border-t pt-4">
        {row("Subtotal", formatMoney(summary.subtotal))}
        {summary.discountTotal > 0 ? row(`Discount${summary.discount?.code ? ` (${summary.discount.code})` : ""}`, `− ${formatMoney(summary.discountTotal)}`) : null}
        {row("Shipping", !summary.shipping.pincodeChecked && summary.shippingTotal === 0 ? "Calculated at checkout" : summary.shippingTotal === 0 ? "Free" : formatMoney(summary.shippingTotal))}
        {summary.codFee > 0 ? row("Cash on delivery fee", formatMoney(summary.codFee)) : null}
        {!summary.pricesIncludeTax ? row("GST", formatMoney(summary.taxTotal)) : null}
        <div className="sf-border border-t pt-2">{row("Total", formatMoney(summary.grandTotal), true)}</div>
        {summary.pricesIncludeTax && summary.taxTotal > 0 ? <p className="sf-muted text-xs">Includes {formatMoney(summary.taxTotal)} GST</p> : null}
      </dl>
    </div>
  );
}
