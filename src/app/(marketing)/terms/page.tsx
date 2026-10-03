import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin } from "@/features/marketing-site/site";
import { PLATFORM_NAME } from "@/config/platform";

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: "Terms of service", description: "Terms of service for {PLATFORM_NAME}.".replace("{PLATFORM_NAME}", PLATFORM_NAME), path: "/terms", origin: siteOrigin() });
}

export default function Page() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h1 className="font-display text-4xl">Terms of service</h1>
      <p className="mt-2 text-sm text-muted">Summary version. The full legal text is provided with your subscription agreement.</p>
      <p className="mt-8 leading-relaxed">By creating a store you agree to sell only lawful goods, keep your catalogue and prices accurate, honour your published shipping and return policies, and comply with applicable Indian laws including GST and consumer-protection rules. Subscription fees are billed in advance and exclude GST. We may suspend stores that breach these terms, after notice where practical.</p>
    </article>
  );
}
