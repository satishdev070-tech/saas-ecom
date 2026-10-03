import type { Metadata } from "next";
import { buildMarketingMetadata, faqJsonLd, organizationJsonLd, serializeJsonLd, SITE_DESCRIPTION, softwareApplicationJsonLd } from "@/features/marketing-site/seo";
import { siteOrigin, storeRootDomain } from "@/features/marketing-site/site";
import { buildFaqs, PRICING_HREF, SECTION_IDS } from "@/features/marketing-site/content";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { livePreviewUrls } from "@/features/marketing-site/server/themes";
import { findTheme, showcaseThemes } from "@/features/marketing-site/themes";
import { PricingTable } from "@/features/marketing-site/components/pricing-table";
import { ButtonLink, Section, SectionHeading } from "@/features/marketing-site/components/ui";
import { Benefits, Categories, FaqSection, FinalCta, Hero, HowItWorks, ThemeShowcase } from "@/features/marketing-site/components/home-sections";
import { ProductDemos } from "@/features/marketing-site/components/product-demos";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";

export const revalidate = 3600;

/** Industries featured in the home page theme showcase (one theme each, from the real catalogue). */
const SHOWCASE_INDUSTRIES = ["fashion", "jewellery", "beauty", "furniture", "gourmet", "electronics"];
const HERO_THEME = "contemporary-ethnic";

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: `${PLATFORM_NAME} — ${PLATFORM_TAGLINE}`, absoluteTitle: true, description: SITE_DESCRIPTION, path: "/", origin: siteOrigin() });
}

export default async function HomePage() {
  const origin = siteOrigin();
  const themes = showcaseThemes(SHOWCASE_INDUSTRIES);
  const [plans, previews] = await Promise.all([getMarketingPlans(), livePreviewUrls(themes)]);
  const trialDays = maxTrialDays(plans);
  const faqs = buildFaqs(storeRootDomain(), trialDays);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([organizationJsonLd(origin), softwareApplicationJsonLd(origin, plans), faqJsonLd(faqs)]) }} />
      <Hero theme={findTheme(HERO_THEME) ?? themes[0]} trialDays={trialDays} />
      <Benefits />
      <Categories />
      <ThemeShowcase themes={themes} previews={previews} />
      <HowItWorks />
      <ProductDemos rootDomain={storeRootDomain()} />
      <Section id={SECTION_IDS.pricing} tone="canvas" labelledBy="pricing-title">
        <SectionHeading id="pricing-title" eyebrow="Pricing" title="Plans that grow with your business" body="Compare limits and features. Every plan includes the theme editor, checkout and order management." />
        <div className="mt-12">
          <PricingTable plans={plans} />
        </div>
        <div className="mt-10 text-center">
          <ButtonLink href={PRICING_HREF} variant="secondary" track={{ id: "compare_plans", location: "home_pricing" }}>
            Compare all plan features
          </ButtonLink>
        </div>
      </Section>
      <FaqSection faqs={faqs} />
      <FinalCta trialDays={trialDays} />
    </>
  );
}
