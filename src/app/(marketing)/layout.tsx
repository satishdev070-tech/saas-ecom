import type { Metadata } from "next";
import { MarketingFooter, MarketingHeader } from "@/features/marketing-site/components/chrome";
import { PlatformAnalytics } from "@/features/marketing-site/components/platform-analytics";
import { getPublicPlatformConfig, platformIconMetadata } from "@/features/platform/server/public-config";

export function generateMetadata(): Promise<Metadata> {
  return platformIconMetadata();
}

/** Public marketing site (platform host only; storefront hosts are rewritten before reaching it). */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { ga4Id } = await getPublicPlatformConfig();
  return (
    <div data-theme="light" className="theme-brand flex min-h-full flex-1 flex-col">
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <MarketingFooter />
      {ga4Id ? <PlatformAnalytics id={ga4Id} /> : null}
    </div>
  );
}
