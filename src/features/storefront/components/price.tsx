import { discountPercent, formatMoney } from "@/lib/money";

/** Price with optional MRP strike-through and "% off". Amounts in paise. */
export function Price({
  priceMinor,
  compareAtMinor,
  fromPrice = false,
  showCompare = true,
  showPercent = true,
  size = "md",
}: {
  priceMinor: number;
  compareAtMinor?: number | null;
  fromPrice?: boolean;
  showCompare?: boolean;
  showPercent?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const pct = discountPercent(priceMinor, compareAtMinor ?? null);
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${cls}`}>
      <span className={pct ? "sf-price-sale font-medium" : "font-medium"}>
        {fromPrice ? <span className="sf-muted text-[0.8em] font-normal">From </span> : null}
        {formatMoney(priceMinor)}
      </span>
      {pct && showCompare && compareAtMinor ? (
        <span className="sf-muted text-[0.85em] line-through">
          <span className="sr-only">MRP </span>
          {formatMoney(compareAtMinor)}
        </span>
      ) : null}
      {pct && showPercent ? <span className="text-[0.8em] font-medium text-[var(--sf-sale)]">{pct}% off</span> : null}
    </p>
  );
}

export function Stars({ rating, count, small = false }: { rating: number; count?: number; small?: boolean }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-1 ${small ? "text-xs" : "text-sm"}`}>
      <span aria-hidden className="tracking-tight text-[var(--sf-accent)]">
        {"★".repeat(full)}
        <span className="opacity-30">{"★".repeat(5 - full)}</span>
      </span>
      <span className="sr-only">Rated {rating.toFixed(1)} out of 5</span>
      {count !== undefined ? <span className="sf-muted">({count})</span> : null}
    </span>
  );
}
