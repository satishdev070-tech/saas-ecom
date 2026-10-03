import { MarketingFooter, MarketingHeader } from "@/features/marketing-site/components/chrome";

/** Public marketing site (platform host only; storefront hosts are rewritten before reaching it). */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="theme-brand flex min-h-full flex-1 flex-col">
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
