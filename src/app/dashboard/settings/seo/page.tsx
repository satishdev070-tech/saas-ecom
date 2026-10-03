import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { assetUrl } from "@/lib/storage/assets";
import { storeOrigin } from "@/lib/platform/urls";
import { Card, PageHeader } from "@/components/ui/layout";
import { getStoreProfile } from "@/features/settings/queries";
import { storePrimaryHost } from "@/features/integrations/server/store";
import { SeoSettingsForm } from "@/features/settings/ui/seo-form";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const [store, host] = await Promise.all([getStoreProfile(ctx.tenantId), storePrimaryHost(ctx.tenantId)]);
  const seo = (store.seo ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof seo[k] === "string" ? (seo[k] as string) : "");
  const origin = host ? storeOrigin(host) : "";
  return (
    <div className="space-y-6">
      <PageHeader title="SEO" description="Search engine and social sharing settings for your whole store. Each product, collection, category, page and blog post also has its own listing fields." />
      {can(ctx, "settings.write") ? (
        <SeoSettingsForm
          storeName={store.name}
          origin={origin || "your-store"}
          v={{ seoTitle: s("title"), seoDescription: s("description"), noindex: seo.noindex === true, googleVerification: s("google_verification"), bingVerification: s("bing_verification"), ogImageUrl: assetUrl(s("og_image_path") || null) }}
        />
      ) : (
        <p className="text-small text-muted">You can view but not change SEO settings.</p>
      )}
      <Card title="Generated for you">
        <ul className="space-y-2 text-small">
          <li>
            <span className="text-muted">Sitemap: </span>
            {origin ? <a href={`${origin}/sitemap.xml`} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{`${origin}/sitemap.xml`}</a> : "available once a domain is verified"}
            <span className="text-muted"> (submit it in Search Console)</span>
          </li>
          <li>
            <span className="text-muted">robots.txt: </span>
            {origin ? <a href={`${origin}/robots.txt`} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{`${origin}/robots.txt`}</a> : "—"}
          </li>
          <li className="text-muted">Structured data: Organization, WebSite (search box), BreadcrumbList, Product with Offer and AggregateRating, BlogPosting.</li>
          <li>
            <Link href="/dashboard/content/redirects" className="text-accent hover:underline">Manage URL redirects →</Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
