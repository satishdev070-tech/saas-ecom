import type { Metadata } from "next";
import { after } from "next/server";
import { getRenderContext } from "@/features/theme/render/load";
import { SectionList } from "@/features/theme/render/sections";
import { buildPageMetadata, jsonLdString, toDescription, websiteJsonLd } from "@/features/storefront/seo";
import { canonicalUrl } from "@/features/storefront/urls";
import { assetUrl } from "@/lib/storage/assets";
import { trackStoreEvent } from "@/features/storefront/server/events";

export async function generateMetadata({ params }: PageProps<"/store/[host]">): Promise<Metadata> {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const title = sf.store.seo.title || sf.store.name;
  const meta = buildPageMetadata({
    primaryHost: sf.tenant.primaryHost,
    path: "/",
    title,
    description: toDescription(sf.store.seo.description || sf.store.tagline),
    imageUrl: assetUrl(sf.store.seo.ogImagePath),
    siteName: sf.store.name,
    noindex: sf.preview,
  });
  // Absolute: the store's home title must not pick up the platform's "… · The Paliya" template.
  return { ...meta, title: { absolute: title } };
}

export default async function StorefrontHome({ params }: PageProps<"/store/[host]">) {
  const { host } = await params;
  const ctx = await getRenderContext(host);
  const { sf } = ctx;
  after(() => trackStoreEvent({ tenantId: sf.tenant.tenantId, name: "page_view", path: "/" }));
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: sf.store.name,
    url: canonicalUrl(sf.tenant.primaryHost, "/"),
    logo: assetUrl(sf.store.logoPath) ?? undefined,
    sameAs: sf.store.social.map((s) => s.url),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(websiteJsonLd(sf.tenant.primaryHost, sf.store.name)) }} />
      <h1 className="sr-only">{sf.store.name}</h1>
      <SectionList sections={sf.theme.templates.home} ctx={ctx} />
    </>
  );
}
