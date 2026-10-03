import type { Metadata } from "next";
import { getRenderContext } from "@/features/theme/render/load";
import { getPageBySlug } from "@/features/storefront/server/content";
import { redirectOrNotFound } from "@/features/storefront/server/redirects";
import { buildPageMetadata } from "@/features/storefront/seo";
import { paths } from "@/features/storefront/urls";
import { ContentBlocks } from "@/features/storefront/components/content-blocks";
import { Breadcrumbs } from "@/features/storefront/components/breadcrumbs";

export async function generateMetadata({ params }: PageProps<"/store/[host]/pages/[slug]">): Promise<Metadata> {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const page = await getPageBySlug(sf.tenant.tenantId, slug);
  if (!page) return {};
  return buildPageMetadata({ primaryHost: sf.tenant.primaryHost, path: paths.page(page.slug), title: page.seo.title || page.title, description: page.seo.description, siteName: sf.store.name, noindex: page.seo.noindex });
}

export default async function StorePage({ params }: PageProps<"/store/[host]/pages/[slug]">) {
  const { host, slug } = await params;
  const { sf } = await getRenderContext(host);
  const page = await getPageBySlug(sf.tenant.tenantId, slug);
  if (!page) return redirectOrNotFound(sf.tenant.tenantId, paths.page(slug));
  return (
    <article className="sf-container sf-section mx-auto max-w-3xl space-y-6">
      <Breadcrumbs primaryHost={sf.tenant.primaryHost} items={[{ name: "Home", path: "/" }, { name: page.title, path: paths.page(page.slug) }]} />
      <h1 className="sf-heading text-4xl">{page.title}</h1>
      <ContentBlocks blocks={page.blocks} />
    </article>
  );
}
