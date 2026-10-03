import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { SectionList, splitAtPageContent } from "@/features/theme/render/sections";
import { getCategoryBySlug, getListingFacets, listProducts } from "@/features/storefront/server/catalog";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";
import { LISTING_PAGE_SIZE, parseListingParams, toListingRpcArgs } from "@/features/storefront/filters";
import { buildPageMetadata, toDescription } from "@/features/storefront/seo";
import { paths } from "@/features/storefront/urls";
import { assetUrl } from "@/lib/storage/assets";
import { ListingView } from "@/features/storefront/components/listing";
import { Breadcrumbs } from "@/features/storefront/components/breadcrumbs";

export async function generateMetadata({ params, searchParams }: PageProps<"/store/[host]/categories/[slug]">): Promise<Metadata> {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const found = await getCategoryBySlug(sf.tenant.tenantId, slug);
  if (!found) return {};
  const c = found.category;
  return buildPageMetadata({
    primaryHost: sf.tenant.primaryHost,
    path: paths.category(c.slug),
    title: c.seo.title || c.name,
    description: toDescription(c.seo.description || c.description),
    imageUrl: assetUrl(c.seo.ogImagePath || c.imagePath),
    siteName: sf.store.name,
    noindex: Object.keys(await searchParams).length > 0 || c.seo.noindex,
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/store/[host]/categories/[slug]">) {
  const { host, slug } = await params;
  const ctx = await getRenderContext(host);
  const tenantId = ctx.sf.tenant.tenantId;
  const found = await getCategoryBySlug(tenantId, slug);
  if (!found) return redirectOrNotFound(tenantId, paths.category(slug));
  const { category, trail, children } = found;
  const filters = parseListingParams(await searchParams);
  const [{ cards, total }, facets] = await Promise.all([
    listProducts(tenantId, { ...toListingRpcArgs(filters), p_category: category.id }),
    getListingFacets(tenantId, { categoryId: category.id }),
  ]);
  const [sectionsBefore, sectionsAfter] = splitAtPageContent(ctx.sf.theme.templates.collection);
  return (
    <>
      <SectionList sections={sectionsBefore} ctx={ctx} />
      <div className="sf-container sf-section space-y-6">
        <Breadcrumbs primaryHost={ctx.sf.tenant.primaryHost} items={[{ name: "Home", path: "/" }, ...trail.map((c) => ({ name: c.name, path: paths.category(c.slug) }))]} />
        <header className="max-w-2xl space-y-2">
          <h1 className="sf-heading text-4xl">{category.name}</h1>
          {category.description ? <p className="sf-muted">{category.description}</p> : null}
        </header>
        {children.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Subcategories">
            {children.map((c) => (
              <li key={c.id}>
                <Link href={paths.category(c.slug)} className="sf-badge">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <ListingView basePath={paths.category(category.slug)} filters={filters} facets={facets} products={cards} total={total} pageSize={LISTING_PAGE_SIZE} cardSettings={ctx.sf.theme.productCard} />
      </div>
      <SectionList sections={sectionsAfter} ctx={ctx} />
    </>
  );
}
