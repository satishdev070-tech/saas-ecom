import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { listPlatformSettings } from "@/features/platform/server/queries";
import { brandImageView, getPublicPlatformConfig } from "@/features/platform/server/public-config";
import { BrandImageForm } from "@/features/platform/components/branding-forms";
import { SettingCards } from "@/features/platform/components/setting-cards";
import { Card, PageHeader } from "@/components/ui/layout";
import { PUBLIC_CONFIG_KEYS } from "@/features/platform/public-config";

export const metadata: Metadata = { title: "Branding & analytics" };

const RASTER = "image/png,image/jpeg,image/webp";

export default async function BrandingPage() {
  await requirePlatform("platform.settings.manage");
  const [config, stored] = await Promise.all([getPublicPlatformConfig(), listPlatformSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Branding & analytics" description="Logos, favicon and Google Analytics for the public marketing site, seller sign-in and onboarding. Store owners' own logos are set in each store's dashboard. Files are public; every change is audited." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Header logo" description="Top of every marketing page, seller sign-in and onboarding.">
          <BrandImageForm slot="header_logo" current={brandImageView(config.headerLogo)} accept={RASTER} hint="PNG or WebP with a transparent background, about 64px tall (shown at 32px). Max 2 MB." />
        </Card>
        <Card title="Footer logo" description="On the dark footer. Leave empty to reuse the header logo.">
          <BrandImageForm slot="footer_logo" current={brandImageView(config.footerLogo)} dark accept={RASTER} hint="A light (white) version reads best on the dark footer. Max 2 MB." />
        </Card>
        <Card title="Favicon" description="Browser tab and bookmark icon for the platform (not stores).">
          <BrandImageForm slot="favicon" current={brandImageView(config.favicon)} accept={`${RASTER},image/x-icon,.ico`} hint="Square PNG (512×512 recommended) or .ico. Max 2 MB." />
        </Card>
      </div>
      <SettingCards keys={[PUBLIC_CONFIG_KEYS.ga4]} stored={stored} />
    </div>
  );
}
