import type { Metadata } from "next";
import { buildMarketingMetadata, faqJsonLd, organizationJsonLd, serializeJsonLd, SITE_DESCRIPTION, softwareApplicationJsonLd } from "@/features/marketing-site/seo";
import { siteOrigin, storeRootDomain } from "@/features/marketing-site/site";
import { buildFaqs, SECTION_IDS } from "@/features/marketing-site/content";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { PricingTable } from "@/features/marketing-site/components/pricing-table";
import { BrandStrip, Builder, FaqSection, FashionFeatures, FeatureRows, FinalCta, Hero, HowItWorks, Metrics, ProblemSolution, Themes } from "@/features/marketing-site/components/sections";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: `${PLATFORM_NAME} — ${PLATFORM_TAGLINE}`, absoluteTitle: true, description: SITE_DESCRIPTION, path: "/", origin: siteOrigin() });
}

export default async function HomePage() {
  const origin = siteOrigin();
  const plans = await getMarketingPlans();
  const faqs = buildFaqs(storeRootDomain());
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([organizationJsonLd(origin), softwareApplicationJsonLd(origin, plans), faqJsonLd(faqs)]) }} />
      <Hero />
      <BrandStrip />
      <ProblemSolution />
      <Themes />
      <Builder />
      <FeatureRows />
      <FashionFeatures />
      <Metrics />
      <HowItWorks />
      <section id={SECTION_IDS.pricing} className="py-24" aria-labelledby="pricing-title">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pricing</p>
            <h2 id="pricing-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
              Simple plans that grow with you.
            </h2>
          </div>
          <PricingTable plans={plans} />
        </div>
      </section>
      <FaqSection faqs={faqs} />
      <FinalCta trialDays={maxTrialDays(plans)} />
    </>
  );
}
