import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { SectionList, splitAtPageContent } from "@/features/theme/render/sections";
import { categoryTrail, getAllCategories, getProductBySlug, listProducts } from "@/features/storefront/server/catalog";
import { getProductReviews } from "@/features/storefront/server/content";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";
import { buildPageMetadata, jsonLdString, productJsonLd, toDescription } from "@/features/storefront/seo";
import { canonicalUrl, paths } from "@/features/storefront/urls";
import { productTypeLabel } from "@/features/storefront/constants";
import { assetUrl } from "@/lib/storage/assets";
import { formatMoney } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStoreCustomer } from "@/features/customer-account/session";
import { Breadcrumbs } from "@/features/storefront/components/breadcrumbs";
import { ProductPurchase } from "@/features/storefront/components/pdp";
import { TrackEvent } from "@/features/tracking/components/track-event";
import { ShareButton } from "@/features/storefront/components/share-button";
import { RichText } from "@/features/storefront/components/rich-text";
import { ReviewCard, ReviewSummary } from "@/features/storefront/components/review-card";
import { PincodeCheck, RecentlyViewed, ReviewForm, WishlistButton } from "@/features/storefront/components/islands";
import { ProductRow } from "@/features/storefront/components/product-card";
import { Stars } from "@/features/storefront/components/price";
import { trackStoreEvent } from "@/features/storefront/server/events";

export async function generateMetadata({ params }: PageProps<"/store/[host]/products/[slug]">): Promise<Metadata> {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const p = await getProductBySlug(sf.tenant.tenantId, slug);
  if (!p) return {};
  return buildPageMetadata({
    primaryHost: sf.tenant.primaryHost,
    path: paths.product(p.slug),
    title: p.seo.title || p.title,
    description: toDescription(p.seo.description || p.shortDescription || p.description),
    imageUrl: assetUrl(p.seo.ogImagePath || p.media[0]?.path),
    siteName: sf.store.name,
    noindex: p.seo.noindex,
    canonical: p.seo.canonical,
  });
}


export default async function ProductPage({ params }: PageProps<"/store/[host]/products/[slug]">) {
  const { host, slug } = await params;
  const ctx = await getRenderContext(host);
  const { sf } = ctx;
  const tenantId = sf.tenant.tenantId;
  const p = await getProductBySlug(tenantId, slug);
  if (!p) return redirectOrNotFound(tenantId, paths.product(slug));

  const [categories, related, reviewData, customer] = await Promise.all([
    getAllCategories(tenantId),
    listProducts(tenantId, p.categoryId ? { p_category: p.categoryId, p_exclude: p.id, p_limit: 8, p_offset: 0, p_sort: "best_selling" } : { p_exclude: p.id, p_limit: 8, p_offset: 0, p_sort: "newest" }),
    sf.features.reviews ? getProductReviews(tenantId, p.id, 10) : Promise.resolve({ reviews: [], distribution: [] }),
    getStoreCustomer(tenantId),
  ]);
  let saved = false;
  if (customer) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("wishlist_items").select("product_id").eq("customer_id", customer.id).eq("product_id", p.id).maybeSingle();
    saved = Boolean(data);
  }
  after(() => trackStoreEvent({ tenantId, name: "product_view", path: paths.product(p.slug), productId: p.id }));

  const reviewCount = reviewData.distribution.reduce((x, n) => x + n, 0);
  const reviewAvg = reviewCount ? reviewData.distribution.reduce((x, n, i) => x + n * (i + 1), 0) / reviewCount : 0;
  const trail = categoryTrail(categories, p.categoryId);
  const prices = p.variants.map((v) => v.priceMinor);
  const cod = sf.store.cod;
  const codNote = sf.features.cod && cod.enabled ? `Cash on delivery available${cod.maxOrderMinor ? ` on orders up to ${formatMoney(cod.maxOrderMinor)}` : ""}${cod.feeMinor ? ` (${formatMoney(cod.feeMinor)} fee)` : ""}.` : null;
  const ld = productJsonLd({
    primaryHost: sf.tenant.primaryHost,
    path: paths.product(p.slug),
    name: p.title,
    description: toDescription(p.shortDescription || p.description, 500),
    images: p.media.map((m) => assetUrl(m.path)).filter((u): u is string => !!u).slice(0, 6),
    sku: p.variants[0]?.sku,
    brand: p.brand || sf.store.name,
    storeName: sf.store.name,
    lowPriceMinor: Math.min(...prices),
    highPriceMinor: Math.max(...prices),
    offerCount: p.variants.length,
    inStock: p.variants.some((v) => v.inStock),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
  });

  const [sectionsBefore, sectionsAfter] = splitAtPageContent(sf.theme.templates.product);
  return (
    <>
      <SectionList sections={sectionsBefore} ctx={ctx} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <TrackEvent
        name="view_item"
        params={{
          value: Math.min(...prices) / 100,
          items: [{ item_id: p.variants[0]?.sku || p.id, item_name: p.title, ...(trail.length ? { item_category: trail[trail.length - 1]!.name } : {}), price: Math.min(...prices) / 100, quantity: 1 }],
        }}
      />
      <div className="sf-container sf-section space-y-6">
        <Breadcrumbs
          primaryHost={sf.tenant.primaryHost}
          items={[{ name: "Home", path: "/" }, ...trail.map((c) => ({ name: c.name, path: paths.category(c.slug) })), { name: p.title, path: paths.product(p.slug) }]}
        />
        <ProductPurchase
          title={p.title}
          brand={p.brand || sf.store.name}
          options={p.options}
          variants={p.variants}
          media={p.media}
          sizeChart={p.sizeChart}
          codNote={codNote}
          rating={
            p.ratingCount > 0 ? (
              <a key="rating" href="#reviews" className="inline-flex" aria-label={`Rated ${p.ratingAvg.toFixed(1)} out of 5 from ${p.ratingCount} reviews`}>
                <Stars rating={p.ratingAvg} count={p.ratingCount} />
              </a>
            ) : null
          }
          panels={[
            ...(p.description || p.shortDescription ? [{ key: "desc", title: "Product Description", icon: "description" as const, open: true, content: <RichText text={(p.description || p.shortDescription)!} /> }] : []),
            // "Other" is the catch-all for non-apparel catalogues: not worth a row.
            ...(p.productType !== "other" || p.attributes.length ? [{
              key: "details",
              title: "Product Details",
              icon: "details" as const,
              content: (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                  {p.productType !== "other" ? (
                    <div className="contents">
                      <dt className="sf-muted">Type</dt>
                      <dd>{productTypeLabel(p.productType)}</dd>
                    </div>
                  ) : null}
                  {p.attributes.map((a) => (
                    <div key={a.label} className="contents">
                      <dt className="sf-muted">{a.label}</dt>
                      <dd>{a.value}</dd>
                    </div>
                  ))}
                </dl>
              ),
            }] : []),
            ...(p.care ? [{ key: "care", title: "Instructions & Care", icon: "care" as const, content: <RichText text={p.care} /> }] : []),
            {
              key: "shipping",
              title: "Shipping & Returns",
              icon: "shipping" as const,
              content: (
                <div className="space-y-4">
                  <p className="whitespace-pre-line">{[p.shippingInfo, p.returnInfo].filter(Boolean).join("\n\n") || "Delivery time and cash-on-delivery availability depend on your PIN code. See our shipping and returns policies for details."}</p>
                  <PincodeCheck />
                </div>
              ),
            },
          ]}
          footer={
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <WishlistButton productId={p.id} initiallySaved={saved} compact />
              <ShareButton title={p.title} url={canonicalUrl(sf.tenant.primaryHost, paths.product(p.slug))} image={assetUrl(p.media[0]?.path)} />
            </div>
          }
        />
      </div>

      {sf.features.reviews ? (
        <section id="reviews" aria-labelledby="reviews-h" className="sf-container sf-section grid gap-10 @[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
          <div className="space-y-5">
            <h2 id="reviews-h" className="sf-heading text-3xl">
              Customer reviews
            </h2>
            {reviewCount ? (
              <>
                <ReviewSummary average={reviewAvg} count={reviewCount} />
                <ul className="space-y-1.5" aria-label="Rating breakdown">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const n = reviewData.distribution[star - 1] ?? 0;
                    return (
                      <li key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-right">{star}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--sf-border)_80%,transparent)]">
                          <span className="block h-full rounded-full bg-[#fbbc04]" style={{ width: `${(n / reviewCount) * 100}%` }} />
                        </span>
                        <span className="sf-muted w-6">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="sf-muted text-sm">No reviews yet. Be the first to share how it fits and feels.</p>
            )}
            {customer ? (
              <details className="pt-1">
                <summary className="sf-btn sf-btn-outline w-full cursor-pointer list-none text-center">Write a review</summary>
                <div className="pt-4">
                  <ReviewForm productId={p.id} />
                </div>
              </details>
            ) : (
              <Link href={`/account/login?next=${encodeURIComponent(paths.product(p.slug))}`} className="sf-btn sf-btn-outline w-full text-center">
                Sign in to write a review
              </Link>
            )}
          </div>
          {reviewData.reviews.length ? (
            <ul className="grid gap-4 @[48rem]:grid-cols-2">
              {reviewData.reviews.map((r) => (
                <li key={r.id}>
                  <ReviewCard review={r} showProduct={false} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {related.cards.length ? (
        <section aria-labelledby="related-h" className="sf-container sf-section">
          <h2 id="related-h" className="sf-heading mb-6 text-3xl">
            You may also like
          </h2>
          <ProductRow products={related.cards} settings={sf.theme.productCard} />
        </section>
      ) : null}
      <RecentlyViewed current={{ slug: p.slug, title: p.title }} />
      <SectionList sections={sectionsAfter} ctx={ctx} />
    </>
  );
}
