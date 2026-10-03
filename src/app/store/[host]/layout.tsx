import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveStorefrontTenant, verifiedStorefrontHost } from "@/lib/tenant/resolve";
import { storefrontAvailability } from "@/lib/tenant/context";
import { assetUrl } from "@/lib/storage/assets";
import { canonicalUrl } from "@/features/storefront/urls";
import { toDescription } from "@/features/storefront/seo";
import { ThemeTokensStyle } from "@/features/theme/tokens-style";
import { SectionList } from "@/features/theme/render/sections";
import { getRenderContext } from "@/features/theme/render/load";
import { Suspense } from "react";
import { getTrackingConfig } from "@/features/tracking/server/config";
import { TrackingTags } from "@/features/tracking/components/tracking-tags";
import { StoreUnavailable } from "./store-unavailable";
import { ComingSoon } from "./coming-soon";
import { DomainPending } from "./domain-pending";
import { pendingDomainState } from "@/lib/tenant/directory";
import { isHiddenDraft } from "@/features/stores/launch";
import { PreviewEscapeBridge } from "@/features/storefront/components/preview-escape";
import { RouteProgress } from "@/features/storefront/components/route-progress";
import "@/features/theme/storefront.css";

/**
 * Storefront shell for every tenant host (reached only via the proxy rewrite). Renders the
 * published theme's header/footer groups around every store page, including cart,
 * checkout and account pages.
 */
export async function generateMetadata({ params }: LayoutProps<"/store/[host]">): Promise<Metadata> {
  const { host } = await params;
  const tenant = await resolveStorefrontTenant(host);
  if (!tenant || storefrontAvailability(tenant.status) !== "open") return { robots: { index: false, follow: false } };
  if (await isHiddenDraft(tenant.tenantId)) return { title: { absolute: `${tenant.name} · Coming soon` }, robots: { index: false, follow: false } };
  const { sf } = await getRenderContext(host);
  const icon = assetUrl(sf.store.faviconPath);
  const ogImage = assetUrl(sf.store.seo.ogImagePath ?? null);
  const verification = {
    ...(sf.store.seo.googleVerification ? { google: sf.store.seo.googleVerification } : {}),
    ...(sf.store.seo.bingVerification ? { other: { "msvalidate.01": sf.store.seo.bingVerification } } : {}),
  };
  return {
    metadataBase: new URL(canonicalUrl(tenant.primaryHost, "/")),
    title: { default: sf.store.seo.title || sf.store.name, template: `%s · ${sf.store.name}` },
    description: toDescription(sf.store.seo.description || sf.store.description || sf.store.tagline),
    applicationName: sf.store.name,
    icons: icon ? { icon } : undefined,
    robots: sf.preview || sf.themePreview || sf.store.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: { siteName: sf.store.name, locale: "en_IN", type: "website", ...(ogImage ? { images: [{ url: ogImage }] } : {}) },
    ...(Object.keys(verification).length ? { verification } : {}),
  };
}

export default async function StorefrontLayout({ children, params }: LayoutProps<"/store/[host]">) {
  const { host } = await params;
  const tenant = await resolveStorefrontTenant(host);
  if (!tenant) {
    const routeHost = await verifiedStorefrontHost(host);
    const pending = routeHost ? await pendingDomainState(routeHost) : null;
    if (pending && routeHost) return <DomainPending host={routeHost} state={pending} />;
    notFound();
  }
  switch (storefrontAvailability(tenant.status)) {
    case "unavailable":
      notFound();
    case "suspended":
      return <StoreUnavailable storeName={tenant.name} />;
    case "open":
      break;
  }
  // Draft stores (created by onboarding, not yet published) stay private; the owner's signed
  // preview cookie lets them see it. Fails open to "live" (features/stores/launch.ts).
  if (await isHiddenDraft(tenant.tenantId)) return <ComingSoon storeName={tenant.name} />;
  const ctx = await getRenderContext(host);
  const tracking = ctx.sf.preview || ctx.sf.themePreview ? null : await getTrackingConfig(tenant.tenantId);
  return (
    <div data-sf-root data-heading-align={ctx.sf.theme.tokens.sectionHeadingAlign} className="sf-root">
      <ThemeTokensStyle tokens={ctx.sf.theme.tokens} />
      <RouteProgress />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
        Skip to content
      </a>
      {ctx.sf.preview ? (
        <div role="status" className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
          Previewing your unpublished theme.{" "}
          <Link href="/preview?exit=1" className="underline">
            Exit preview
          </Link>
        </div>
      ) : ctx.sf.themePreview ? (
        <div role="status" className="bg-neutral-900 px-4 py-2 text-center text-xs text-white">
          Live preview of the <strong>{ctx.sf.themePreview.name}</strong> theme on a demo store. Nothing is saved.{" "}
          <Link href="/?sf_theme=exit" prefetch={false} className="underline">
            Exit preview
          </Link>
          <PreviewEscapeBridge />
        </div>
      ) : null}
      <SectionList sections={ctx.sf.theme.layout.header} ctx={ctx} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SectionList sections={ctx.sf.theme.layout.footer} ctx={ctx} />
      {tracking ? (
        <Suspense fallback={null}>
          <TrackingTags config={tracking} />
        </Suspense>
      ) : null}
    </div>
  );
}
