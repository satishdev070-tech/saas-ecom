import type { Metadata } from "next";
import { TrackEvent } from "@/features/tracking/components/track-event";
import { after } from "next/server";
import { getRenderContext } from "@/features/theme/render/load";
import { getListingFacets, listProducts } from "@/features/storefront/server/catalog";
import { LISTING_PAGE_SIZE, parseListingParams, toListingRpcArgs } from "@/features/storefront/filters";
import { ListingView } from "@/features/storefront/components/listing";
import { trackStoreEvent } from "@/features/storefront/server/events";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ params, searchParams }: PageProps<"/store/[host]/search">) {
  const { host } = await params;
  const ctx = await getRenderContext(host);
  const tenantId = ctx.sf.tenant.tenantId;
  const filters = parseListingParams(await searchParams, { searchMode: true });
  const [{ cards, total }, facets] = await Promise.all([listProducts(tenantId, toListingRpcArgs(filters)), getListingFacets(tenantId, { query: filters.q || undefined })]);
  if (filters.q) after(() => trackStoreEvent({ tenantId, name: "search", path: "/search", metadata: { q: filters.q.slice(0, 80), results: total } }));
  return (
    <div className="sf-container sf-section space-y-6">
      {filters.q ? <TrackEvent name="search" params={{ search_term: filters.q.slice(0, 80) }} /> : null}
      <h1 className="sf-heading text-4xl">{filters.q ? `Results for “${filters.q}”` : "Search"}</h1>
      <form action="/search" role="search" className="flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Kurta, saree, indigo…" className="sf-input min-w-0 flex-1" autoComplete="off" />
        <button type="submit" className="sf-btn">
          Search
        </button>
      </form>
      <ListingView basePath="/search" filters={filters} facets={facets} products={cards} total={total} pageSize={LISTING_PAGE_SIZE} cardSettings={ctx.sf.theme.productCard} searchMode />
    </div>
  );
}
