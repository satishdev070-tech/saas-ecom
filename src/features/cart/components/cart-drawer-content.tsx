import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { paths } from "@/features/storefront/urls";
import { StoreImage } from "@/features/storefront/components/store-image";
import { getCartView, getFreeShippingThreshold } from "../queries";
import { LineButtons, LineQuantity } from "./cart-controls";

/**
 * Server-rendered body of the header cart drawer. Totals here are indicative (current prices ×
 * quantity); discounts, shipping and tax are always recomputed server-side at checkout.
 */
export async function CartDrawerContent({ tenantId }: { tenantId: string }) {
  const [view, freeFrom] = await Promise.all([getCartView(tenantId), getFreeShippingThreshold(tenantId)]);
  const lines = view.lines;
  if (!lines.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="sf-heading text-2xl">Your bag is empty</p>
        <p className="sf-muted text-sm">Add a few favourites and they&apos;ll wait for you here.</p>
        <Link href={paths.collections()} className="sf-btn">
          Start shopping
        </Link>
      </div>
    );
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const remaining = freeFrom ? Math.max(0, freeFrom - subtotal) : null;
  return (
    <>
      {freeFrom ? (
        <div className="sf-border border-b px-5 py-3 text-sm">
          <p>{remaining ? <>You&apos;re {formatMoney(remaining)} away from free shipping</> : "You've unlocked free shipping"}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--sf-border)]" role="progressbar" aria-valuemin={0} aria-valuemax={freeFrom} aria-valuenow={Math.min(subtotal, freeFrom)} aria-label="Progress to free shipping">
            <div className="h-full rounded-full bg-[var(--sf-primary)] transition-[width] duration-500" style={{ width: `${Math.min(100, (subtotal / freeFrom) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      <ul className="flex-1 divide-y divide-[var(--sf-border)] overflow-y-auto px-5">
        {lines.map((l) => (
          <li key={l.id} className="flex gap-4 py-4">
            <Link href={paths.product(l.productSlug)} className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-[var(--sf-radius-card)]">
              <StoreImage path={l.imagePath} alt={l.imageAlt ?? l.productTitle} sizes="80px" />
            </Link>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex justify-between gap-3">
                <Link href={paths.product(l.productSlug)} className="line-clamp-2 text-sm">
                  {l.productTitle}
                </Link>
                <p className="shrink-0 text-sm tabular-nums">{formatMoney(l.unitPrice * l.quantity)}</p>
              </div>
              {l.options.length ? <p className="sf-muted text-xs">{l.options.map((o) => o.value).join(" · ")}</p> : null}
              {!l.inStock || !l.purchasable ? <p className="text-xs text-[var(--sf-sale)]">{l.purchasable ? "Out of stock" : "No longer available"}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <LineQuantity itemId={l.id} quantity={l.quantity} max={l.availableQuantity || l.quantity} />
                <LineButtons itemId={l.id} saved={false} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="sf-border space-y-3 border-t px-5 py-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-medium tabular-nums">{formatMoney(subtotal)}</span>
        </div>
        <p className="sf-muted text-xs">Shipping and discounts are calculated at checkout.</p>
        <Link href="/checkout" className="sf-btn w-full">
          Checkout
        </Link>
        <Link href={paths.cart()} className="sf-btn sf-btn-outline w-full">
          View bag
        </Link>
      </div>
    </>
  );
}
