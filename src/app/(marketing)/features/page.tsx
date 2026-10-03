import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin } from "@/features/marketing-site/site";
import { maxTrialDays } from "@/features/marketing-site/plans";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { Builder, FashionFeatures, FeatureRows, FinalCta, HowItWorks } from "@/features/marketing-site/components/sections";

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: "Features", description: "Catalogue, checkout, orders, inventory, themes, SEO and custom domains — built for Indian fashion labels.", path: "/features", origin: siteOrigin() });
}

export default async function FeaturesPage() {
  const plans = await getMarketingPlans();
  return (
    <>
      <header className="mx-auto max-w-3xl px-4 pt-20 text-center sm:px-6">
        <h1 className="font-display text-4xl leading-tight sm:text-6xl">Everything your label needs to sell online.</h1>
      </header>
      <FeatureRows />
      <FashionFeatures />
      <Builder />
      <HowItWorks />
      <FinalCta trialDays={maxTrialDays(plans)} />
    </>
  );
}
