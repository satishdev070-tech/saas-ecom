import Link from "next/link";
import type { ProductCardData } from "@/features/storefront/server/catalog";
import type { ProductCardSettings } from "@/features/theme/schema/tokens";
import { IMAGE_RATIOS } from "@/features/theme/schema/tokens";
import { paths } from "@/features/storefront/urls";
import { discountPercent } from "@/lib/money";
import { Price, Stars } from "./price";
import { StoreImage } from "./store-image";
import { CardQuickAdd, CardWishlist } from "./card-actions";
import { Carousel } from "./carousel";

export function ProductCard({ product, settings, priority = false }: { product: ProductCardData; settings: ProductCardSettings; priority?: boolean }) {
  const pct = discountPercent(product.priceMinor, product.compareAtMinor);
  const hasAlt = settings.secondImageOnHover && !!product.hoverImagePath;
  const pill = settings.badgeStyle === "pill";
  const badges: { label: string; cls: string }[] = [];
  if (settings.offerBadge && product.inStock) badges.push({ label: settings.offerBadge, cls: "sf-badge sf-badge-offer" });
  if (settings.showBadges) {
    if (!product.inStock) badges.push({ label: "Sold out", cls: "sf-badge" });
    // Pill style shows the discount as a green pill under the price instead of on the image.
    else if (pct && !pill) badges.push({ label: settings.showDiscountPercent ? `${pct}% off` : "Sale", cls: "sf-badge sf-badge-sale" });
    if (product.isNew) badges.push({ label: "New", cls: settings.badgeStyle === "filled" ? "sf-badge sf-badge-filled" : "sf-badge" });
    else if (product.isBestseller) badges.push({ label: "Bestseller", cls: "sf-badge" });
  }
  const href = paths.product(product.slug);
  const trackItem = JSON.stringify({ item_id: product.id, item_name: product.title, price: product.priceMinor / 100, quantity: 1 });
  const quickAdd = settings.showQuickAdd && product.inStock && (product.sizes.some((sz) => sz.inStock) || product.singleVariantId);
  return (
    <article className={`sf-card group relative flex flex-col ${settings.textAlign === "center" ? "text-center" : ""}`}>
      {/* Media: the link, plus heart and quick add as siblings (never nested interactive elements). */}
      <div className={`sf-card-media relative overflow-hidden ${hasAlt ? "sf-has-alt" : ""}`} style={{ aspectRatio: IMAGE_RATIOS[settings.imageRatio] }}>
        <Link href={href} className="absolute inset-0" tabIndex={-1} aria-hidden data-track-item={trackItem}>
          <StoreImage path={product.imagePath} alt={product.imageAlt || product.title} sizes="(min-width: 1024px) 25vw, 50vw" priority={priority} className="sf-img-main" />
          {hasAlt ? <StoreImage path={product.hoverImagePath} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="sf-img-alt" /> : null}
        </Link>
        {badges.length ? (
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
            {badges.slice(0, 2).map((b) => (
              <span key={b.label} className={b.cls}>
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
        {settings.showWishlist ? <CardWishlist productId={product.id} title={product.title} /> : null}
        {quickAdd ? <CardQuickAdd title={product.title} sizes={product.sizes} singleVariantId={product.singleVariantId} /> : null}
      </div>
      <Link href={href} className="mt-3 block space-y-1" data-track-item={trackItem}>
        {settings.showBrand && product.brand ? <p className="sf-eyebrow">{product.brand}</p> : null}
        <h3 className="sf-card-title line-clamp-2">{product.title}</h3>
        {settings.showRating && product.ratingCount > 0 ? <Stars rating={product.ratingAvg} count={product.ratingCount} small /> : null}
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${settings.textAlign === "center" ? "justify-center" : ""}`}>
          <Price
            priceMinor={product.priceMinor}
            compareAtMinor={product.compareAtMinor}
            fromPrice={product.hasPriceRange}
            showCompare={settings.showComparePrice}
            showPercent={settings.showDiscountPercent && !settings.showBadges && !pill}
            size="sm"
          />
          {pill && pct && product.inStock ? <span className="sf-pill-off">{pct}% off</span> : null}
        </div>
        {settings.showSizes && product.sizes.length ? (
          <ul className={`flex flex-wrap gap-1 pt-0.5 ${settings.textAlign === "center" ? "justify-center" : ""}`} aria-label="Sizes">
            {product.sizes.map((sz) => (
              <li key={sz.value} className={`sf-size-chip ${sz.inStock ? "" : "sf-size-chip-out"}`}>
                {sz.value}
                {sz.inStock ? null : <span className="sr-only"> (sold out)</span>}
              </li>
            ))}
          </ul>
        ) : null}
      </Link>
    </article>
  );
}

export function ProductGrid({ products, settings, columns = 4, priorityCount = 0 }: { products: ProductCardData[]; settings: ProductCardSettings; columns?: number; priorityCount?: number }) {
  const cols = columns >= 4 ? "@[64rem]:grid-cols-4" : columns === 3 ? "@[64rem]:grid-cols-3" : "@[64rem]:grid-cols-2";
  return (
    <ul className={`grid grid-cols-2 gap-x-4 gap-y-8 @[48rem]:grid-cols-3 ${cols}`}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} settings={settings} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductRow({ products, settings }: { products: ProductCardData[]; settings: ProductCardSettings }) {
  return (
    <Carousel label="Products" itemClassName="w-[46%] @[48rem]:w-[31%] @[64rem]:w-[calc((100%-3.75rem)/4)]">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} settings={settings} />
      ))}
    </Carousel>
  );
}
