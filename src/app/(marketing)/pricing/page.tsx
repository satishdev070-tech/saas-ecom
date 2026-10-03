import type { Metadata } from "next";
import { buildMarketingMetadata, serializeJsonLd, softwareApplicationJsonLd } from "@/features/marketing-site/seo";
import { siteOrigin, storeRootDomain } from "@/features/marketing-site/site";
import { buildFaqs } from "@/features/marketing-site/content";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { PricingTable } from "@/features/marketing-site/components/pricing-table";
import { FaqSection, FinalCta } from "@/features/marketing-site/components/sections";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: "Pricing", description: "Plans for Indian fashion brands, with a free trial on every plan. Prices exclude GST.", path: "/pricing", origin: siteOrigin() });
}

export default async function PricingPage() {
  const plans = await getMarketingPlans();
  const faqs = buildFaqs(storeRootDomain()).slice(0, 6);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd(siteOrigin(), plans)) }} />
      <section className="py-20" aria-labelledby="pricing-title">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h1 id="pricing-title" className="font-display text-4xl leading-tight sm:text-6xl">
              Pricing
            </h1>
            <p className="mt-4 text-lg text-muted">Every plan includes checkout with UPI, cards and COD, GST invoices, and the theme editor.</p>
          </div>
          <PricingTable plans={plans} />
        </div>
      </section>
      <FaqSection faqs={faqs} />
      <FinalCta trialDays={maxTrialDays(plans)} />
    </>
  );
}
