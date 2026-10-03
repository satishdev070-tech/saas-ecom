import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { getCartView } from "@/features/cart/queries";
import { quoteCheckoutAction } from "@/features/checkout/actions";
import { listProducts } from "@/features/storefront/server/catalog";
import { paths } from "@/features/storefront/urls";
import { formatMoney } from "@/lib/money";
import { OrderSummary } from "@/features/checkout/components/order-summary";
import { CartNote, CouponForm, LineButtons, LineQuantity } from "@/features/cart/components/cart-controls";
import { TrackEvent } from "@/features/tracking/components/track-event";
import { itemsValue, type AnalyticsItem } from "@/features/tracking/items";
import { StoreImage } from "@/features/storefront/components/store-image";
import { ProductRow } from "@/features/storefront/components/product-card";
import { PincodeCheck } from "@/features/storefront/components/islands";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default async function CartPage({ params, searchParams }: PageProps<"/store/[host]/cart">) {
  const { host } = await params;
  const sp = await searchParams;
  const { sf } = await getRenderContext(host);
  const tenantId = sf.tenant.tenantId;
  const view = await getCartView(tenantId);
  const quote = view.lines.length ? await quoteCheckoutAction({}) : null;
  const summary = quote?.ok ? quote.data : null;
  const issues = new Map((summary?.issues ?? []).map((i) => [i.lineId, i]));
  const crossSell = view.lines.length
    ? await listProducts(tenantId, { p_exclude: view.lines[0]!.productId, p_category: view.lines[0]!.categoryId ?? undefined, p_limit: 8, p_offset: 0, p_sort: "best_selling" })
    : { cards: [] };

  const items: AnalyticsItem[] = view.lines.map((l) => ({ item_id: l.sku || l.productId, item_name: l.productTitle, ...(l.variantTitle ? { item_variant: l.variantTitle } : {}), price: l.unitPrice / 100, quantity: l.quantity }));
  const itemOf = new Map(view.lines.map((l, i) => [l.id, items[i]!]));

  return (
    <div className="sf-container sf-section">
      {items.length ? <TrackEvent name="view_cart" params={{ value: itemsValue(items), items }} /> : null}
      <h1 className="sf-heading mb-8 text-4xl">Your bag</h1>
      {sp.notice === "reorder" ? <p role="status" className="mb-4 text-sm">Items from your previous order were added to your bag.</p> : null}
      {view.lines.length === 0 ? (
        <div className="space-y-4 py-10 text-center">
          <p className="sf-muted">Your bag is empty.</p>
          <Link href={paths.collections()} className="sf-btn">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 @[64rem]:grid-cols-[1fr_380px]">
          <div>
            <ul className="sf-border divide-y divide-[var(--sf-border)] border-y">
              {view.lines.map((l) => {
                const issue = issues.get(l.id);
                return (
                  <li key={l.id} className="flex gap-4 py-5">
                    <Link href={paths.product(l.productSlug)} className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded">
                      <StoreImage path={l.imagePath} alt={l.imageAlt ?? l.productTitle} sizes="96px" />
                    </Link>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex justify-between gap-4">
                        <div>
                          <Link href={paths.product(l.productSlug)} className="font-medium">
                            {l.productTitle}
                          </Link>
                          {l.options.length ? <p className="sf-muted text-sm">{l.options.map((o) => `${o.name}: ${o.value}`).join(" · ")}</p> : null}
                        </div>
                        <p className="text-sm tabular-nums">{formatMoney(l.unitPrice * l.quantity)}</p>
                      </div>
                      {issue ? (
                        <p role="alert" className="text-sm text-[var(--sf-sale)]">
                          {issue.kind === "unavailable" ? "No longer available" : issue.kind === "out_of_stock" ? "Out of stock" : `Only ${issue.maxQuantity} left`}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <LineQuantity itemId={l.id} quantity={l.quantity} max={l.availableQuantity || l.quantity} item={itemOf.get(l.id)} />
                        <LineButtons itemId={l.id} saved={false} item={itemOf.get(l.id)} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-6 @[48rem]:grid-cols-2">
              <CartNote note={view.cart?.note ?? null} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Delivery</p>
                <PincodeCheck />
              </div>
            </div>
            {view.saved.length ? (
              <section aria-labelledby="saved-h" className="mt-10">
                <h2 id="saved-h" className="sf-heading mb-4 text-2xl">
                  Saved for later
                </h2>
                <ul className="space-y-4">
                  {view.saved.map((l) => (
                    <li key={l.id} className="flex items-center gap-4">
                      <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded">
                        <StoreImage path={l.imagePath} alt="" sizes="64px" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{l.productTitle}</p>
                        <LineButtons itemId={l.id} saved />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <aside className="sf-surface sf-border h-fit space-y-5 rounded-[var(--sf-radius-card)] border p-5">
            {summary ? (
              <>
                <CouponForm applied={summary.discount?.code && !summary.discount.automatic ? summary.discount.code : null} message={summary.codeMessage} />
                {summary.discount?.automatic && summary.discount.title ? <p className="text-sm">{summary.discount.title} applied</p> : null}
                <OrderSummary summary={summary} showLines={false} />
                <Link href="/checkout" aria-disabled={summary.issues.length > 0} className={`sf-btn w-full ${summary.issues.length ? "pointer-events-none opacity-50" : ""}`}>
                  Checkout
                </Link>
              </>
            ) : (
              <p className="text-sm">We couldn&apos;t price your bag right now. Please refresh.</p>
            )}
          </aside>
        </div>
      )}
      {crossSell.cards.length ? (
        <section aria-labelledby="xs-h" className="sf-section">
          <h2 id="xs-h" className="sf-heading mb-6 text-2xl">
            Complete the look
          </h2>
          <ProductRow products={crossSell.cards} settings={sf.theme.productCard} />
        </section>
      ) : null}
    </div>
  );
}
