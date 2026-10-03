import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { platformOrigin } from "@/lib/platform/urls";
import { listPlatformSettings } from "@/features/platform/server/queries";
import { brandImageView, getPublicPlatformConfig } from "@/features/platform/server/public-config";
import { BrandImageForm } from "@/features/platform/components/branding-forms";
import { BrandingPreview } from "@/features/platform/components/branding-preview";
import { SettingCards } from "@/features/platform/components/setting-cards";
import { Card, PageHeader } from "@/components/ui/layout";
import { BRANDING_BUCKET, PUBLIC_CONFIG_KEYS } from "@/features/platform/public-config";
import { SITE_DESCRIPTION } from "@/features/marketing-site/seo";

export const metadata: Metadata = { title: "Branding & analytics" };

const RASTER = "image/png,image/jpeg,image/webp";

/** True when migration 2500's storage bucket exists (uploads fail without it). */
async function brandingBucketReady(): Promise<boolean> {
  const { error } = await createSupabasePublicClient().storage.from(BRANDING_BUCKET).list("branding", { limit: 1 });
  return !error;
}

export default async function BrandingPage() {
  await requirePlatform("platform.settings.manage");
  const [config, stored, ready] = await Promise.all([getPublicPlatformConfig(), listPlatformSettings(), brandingBucketReady()]);
  const header = brandImageView(config.headerLogo);
  const footer = brandImageView(config.footerLogo);
  const favicon = brandImageView(config.favicon);
  const share = brandImageView(config.ogImage);
  let siteHost = "buildbrighten.in";
  try {
    siteHost = new URL(platformOrigin()).host.replace(/^www\./, "");
  } catch {
    // keep the default label
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Branding & analytics" description="Logos, favicon, social share image and Google Analytics for the Build Brighten website, seller sign-in, onboarding, the seller dashboard and this console. Store owners set their own store logos in their dashboard. Files are public; every change is audited." />

      {!ready ? (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-small">
          <p className="font-semibold">Uploads aren&apos;t set up yet</p>
          <p className="mt-1">
            The <code>platform-branding</code> storage bucket doesn&apos;t exist in this Supabase project. Open Supabase → SQL Editor, paste the contents of <code>supabase/dev/apply-2500.sql</code> and select Run, then reload this page.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Header logo" description="Top left of every website page, seller sign-in, onboarding and this console.">
          <BrandImageForm slot="header_logo" current={header} accept={RASTER} hint="PNG or WebP with a transparent background, about 120px tall (shown up to 48px tall). Empty margins are trimmed automatically. Max 2 MB." />
        </Card>
        <Card title="Footer logo" description="On the dark footer. Empty = header logo.">
          <BrandImageForm slot="footer_logo" current={footer} dark accept={RASTER} hint="A white / light version reads best on dark. Max 2 MB." />
        </Card>
        <Card title="Favicon" description="Browser tab, bookmarks and home-screen icon.">
          <BrandImageForm slot="favicon" current={favicon} accept={`${RASTER},image/x-icon,.ico`} hint="Square PNG, 512×512 recommended, or .ico. Max 2 MB." />
        </Card>
        <Card title="Social share image" description="Shown when the website is shared on WhatsApp, Facebook, LinkedIn or X.">
          <BrandImageForm slot="og_image" current={share} accept={RASTER} hint="1200×630 JPG or PNG with your logo and a short line. Max 4 MB." />
        </Card>
      </div>

      <Card title="Preview" description="How your files appear on the live site. Updates as soon as you upload.">
        <BrandingPreview header={header} footer={footer} favicon={favicon} share={share} siteHost={siteHost} description={SITE_DESCRIPTION} />
      </Card>

      <SettingCards keys={[PUBLIC_CONFIG_KEYS.ga4]} stored={stored} />
    </div>
  );
}
