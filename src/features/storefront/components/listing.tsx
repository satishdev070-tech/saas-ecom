import Link from "next/link";
import type { ListingFilters } from "@/features/storefront/filters";
import { listingQueryString, withoutFilter, activeFilterCount } from "@/features/storefront/filters";
import type { Facets, ProductCardData } from "@/features/storefront/server/catalog";
import type { ProductCardSettings } from "@/features/theme/schema/tokens";
import { SORT_OPTIONS, productTypeLabel } from "@/features/storefront/constants";
import { ProductGrid } from "./product-card";
import { AutoSubmitSelect } from "./auto-submit";
import { TrackEvent } from "@/features/tracking/components/track-event";

function CheckGroup({ legend, name, values, selected, render }: { legend: string; name: string; values: string[]; selected: string[]; render?: (v: string) => string }) {
  if (!values.length) return null;
  return (
    <fieldset className="sf-border border-b py-4">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {values.map((v) => (
          <label key={v} className="sf-border flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs has-[:checked]:border-[var(--sf-primary)] has-[:checked]:bg-[var(--sf-primary)] has-[:checked]:text-[var(--sf-primary-fg)]">
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} className="sr-only" />
            {render ? render(v) : v}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Filterable, sortable, paginated product listing (collections, categories, search). GET form: works without JS. */
export function ListingView({
  basePath,
  filters,
  facets,
  products,
  total,
  pageSize,
  cardSettings,
  searchMode = false,
}: {
  basePath: string;
  filters: ListingFilters;
  facets: Facets;
  products: ProductCardData[];
  total: number;
  pageSize: number;
  cardSettings: ProductCardSettings;
  searchMode?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const active = activeFilterCount(filters);
  const chips: { label: string; href: string }[] = [
    ...(filters.inStock ? [{ label: "In stock", href: basePath + listingQueryString(withoutFilter(filters, "inStock"), { page: 1 }) }] : []),
    ...(filters.minPrice !== null || filters.maxPrice !== null
      ? [{ label: `₹${filters.minPrice ?? 0} – ${filters.maxPrice !== null ? `₹${filters.maxPrice}` : "any"}`, href: basePath + listingQueryString(withoutFilter(filters, "price"), { page: 1 }) }]
      : []),
    ...filters.types.map((v) => ({ label: productTypeLabel(v), href: basePath + listingQueryString(withoutFilter(filters, "types", v), { page: 1 }) })),
    ...filters.sizes.map((v) => ({ label: `Size ${v}`, href: basePath + listingQueryString(withoutFilter(filters, "sizes", v), { page: 1 }) })),
    ...filters.colours.map((v) => ({ label: v, href: basePath + listingQueryString(withoutFilter(filters, "colours", v), { page: 1 }) })),
    ...filters.fabrics.map((v) => ({ label: v, href: basePath + listingQueryString(withoutFilter(filters, "fabrics", v), { page: 1 }) })),
    ...filters.occasions.map((v) => ({ label: v, href: basePath + listingQueryString(withoutFilter(filters, "occasions", v), { page: 1 }) })),
  ];
  const sortOptions: { value: string; label: string }[] = searchMode ? [{ value: "relevance", label: "Relevance" }, ...SORT_OPTIONS] : [...SORT_OPTIONS];
  const filterForm = (
    <form action={basePath} method="get" className="text-sm">
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      <input type="hidden" name="sort" value={filters.sort} />
      <fieldset className="sf-border border-b py-4">
        <legend className="sr-only">Availability</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="availability" value="in_stock" defaultChecked={filters.inStock} /> In stock only
        </label>
      </fieldset>
      <fieldset className="sf-border border-b py-4">
        <legend className="mb-2 text-sm font-medium">Price (₹)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="f-min">
            Minimum price
          </label>
          <input id="f-min" name="min" inputMode="numeric" defaultValue={filters.minPrice ?? ""} placeholder={String(facets.priceMinRupees ?? 0)} className="sf-input w-full py-1.5" />
          <span aria-hidden>–</span>
          <label className="sr-only" htmlFor="f-max">
            Maximum price
          </label>
          <input id="f-max" name="max" inputMode="numeric" defaultValue={filters.maxPrice ?? ""} placeholder={String(facets.priceMaxRupees ?? "")} className="sf-input w-full py-1.5" />
        </div>
      </fieldset>
      <CheckGroup legend="Product type" name="type" values={facets.productTypes.length === 1 && facets.productTypes[0] === "other" ? [] : facets.productTypes} selected={filters.types} render={productTypeLabel} />
      <CheckGroup legend="Size" name="size" values={facets.sizes} selected={filters.sizes} />
      <CheckGroup legend="Colour" name="colour" values={facets.colours.map((c) => c.value)} selected={filters.colours} />
      <CheckGroup legend="Fabric" name="fabric" values={facets.fabrics} selected={filters.fabrics} />
      <CheckGroup legend="Occasion" name="occasion" values={facets.occasions} selected={filters.occasions} />
      <div className="flex gap-2 py-4">
        <button type="submit" className="sf-btn min-h-10 flex-1 py-2">
          Apply filters
        </button>
        {active ? (
          <Link href={basePath + listingQueryString({ ...filters, inStock: false, minPrice: null, maxPrice: null, types: [], sizes: [], colours: [], fabrics: [], occasions: [], page: 1 })} className="sf-btn sf-btn-outline min-h-10 py-2">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );

  return (
    <div className="grid gap-8 @[64rem]:grid-cols-[240px_1fr]">
      {products.length ? (
        <TrackEvent
          name="view_item_list"
          params={{ item_list_name: basePath, items: products.slice(0, 20).map((p, index) => ({ item_id: p.id, item_name: p.title, price: p.priceMinor / 100, quantity: 1, index, item_list_name: basePath })) }}
        />
      ) : null}
      <aside aria-label="Filters">
        <details className="@[64rem]:hidden">
          <summary className="sf-btn sf-btn-outline w-full cursor-pointer list-none">Filters{active ? ` (${active})` : ""}</summary>
          {filterForm}
        </details>
        <div className="hidden @[64rem]:block">{filterForm}</div>
      </aside>
      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="sf-muted text-sm" aria-live="polite">
            {total} {total === 1 ? "product" : "products"}
          </p>
          <form action={basePath} method="get" className="flex items-center gap-2 text-sm">
            {[...new URLSearchParams(listingQueryString(filters, { page: 1 }).slice(1)).entries()]
              .filter(([k]) => k !== "sort" && k !== "page")
              .map(([k, v], i) => (
                <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
              ))}
            <label htmlFor="sort">Sort by</label>
            <AutoSubmitSelect id="sort" name="sort" defaultValue={filters.sort} className="sf-input py-1.5">
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </AutoSubmitSelect>
            <noscript>
              <button type="submit" className="sf-link">
                Go
              </button>
            </noscript>
          </form>
        </div>
        {chips.length ? (
          <ul className="mb-5 flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.href + c.label}>
                <Link href={c.href} className="sf-badge" aria-label={`Remove filter ${c.label}`}>
                  {c.label} ✕
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {products.length ? (
          <ProductGrid products={products} settings={cardSettings} columns={3} priorityCount={3} />
        ) : (
          <div className="sf-border rounded-[var(--sf-radius-card)] border p-10 text-center">
            <p className="sf-heading text-2xl">No products found</p>
            <p className="sf-muted mt-2 text-sm">{active ? "Try removing a filter." : "Check back soon for new arrivals."}</p>
          </div>
        )}
        {pages > 1 ? (
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3 text-sm">
            {filters.page > 1 ? (
              <Link rel="prev" href={basePath + listingQueryString(filters, { page: filters.page - 1 })} className="sf-btn sf-btn-outline min-h-10 py-2">
                Previous
              </Link>
            ) : null}
            <span>
              Page {filters.page} of {pages}
            </span>
            {filters.page < pages ? (
              <Link rel="next" href={basePath + listingQueryString(filters, { page: filters.page + 1 })} className="sf-btn sf-btn-outline min-h-10 py-2">
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
