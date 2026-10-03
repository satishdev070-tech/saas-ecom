import type { Metadata } from "next";
import { after } from "next/server";
import { getRenderContext } from "@/features/theme/render/load";
import { SectionList, splitAtPageContent } from "@/features/theme/render/sections";
import { getCollectionBySlug, getListingFacets, listProducts } from "@/features/storefront/server/catalog";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";
import { LISTING_PAGE_SIZE, parseListingParams, toListingRpcArgs } from "@/features/storefront/filters";
import { buildPageMetadata, toDescription } from "@/features/storefront/seo";
import { paths } from "@/features/storefront/urls";
import { assetUrl } from "@/lib/storage/assets";
import { ListingView } from "@/features/storefront/components/listing";
import { Breadcrumbs } from "@/features/storefront/components/breadcrumbs";
import { trackStoreEvent } from "@/features/storefront/server/events";

export async function generateMetadata({ params, searchParams }: PageProps<"/store/[host]/collections/[slug]">): Promise<Metadata> {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const c = await getCollectionBySlug(sf.tenant.tenantId, slug);
  if (!c) return {};
  const filtered = Object.keys(await searchParams).length > 0;
  return buildPageMetadata({
    primaryHost: sf.tenant.primaryHost,
    path: paths.collection(c.slug),
    title: c.seo.title || c.title,
    description: toDescription(c.seo.description || c.description),
    imageUrl: assetUrl(c.seo.ogImagePath || c.imagePath),
    siteName: sf.store.name,
    noindex: filtered || c.seo.noindex,
  });
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/store/[host]/collections/[slug]">) {
  const { host, slug } = await params;
  const ctx = await getRenderContext(host);
  const tenantId = ctx.sf.tenant.tenantId;
  const collection = await getCollectionBySlug(tenantId, slug);
  if (!collection) return redirectOrNotFound(tenantId, paths.collection(slug));
  const filters = parseListingParams(await searchParams);
  const [{ cards, total }, facets] = await Promise.all([
    listProducts(tenantId, { ...toListingRpcArgs(filters), p_collection: collection.id }),
    getListingFacets(tenantId, { collectionId: collection.id }),
  ]);
  after(() => trackStoreEvent({ tenantId, name: "page_view", path: paths.collection(slug) }));
  const [sectionsBefore, sectionsAfter] = splitAtPageContent(ctx.sf.theme.templates.collection);
  return (
    <>
      <SectionList sections={sectionsBefore} ctx={ctx} />
      <div className="sf-container sf-section space-y-6">
        <Breadcrumbs primaryHost={ctx.sf.tenant.primaryHost} items={[{ name: "Home", path: "/" }, { name: collection.title, path: paths.collection(collection.slug) }]} />
        <header className="max-w-2xl space-y-2">
          <h1 className="sf-heading text-4xl">{collection.title}</h1>
          {collection.description ? <p className="sf-muted">{collection.description}</p> : null}
        </header>
        <ListingView basePath={paths.collection(collection.slug)} filters={filters} facets={facets} products={cards} total={total} pageSize={LISTING_PAGE_SIZE} cardSettings={ctx.sf.theme.productCard} />
      </div>
      <SectionList sections={sectionsAfter} ctx={ctx} />
    </>
  );
}
