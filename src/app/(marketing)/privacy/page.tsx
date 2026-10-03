import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin } from "@/features/marketing-site/site";
import { PLATFORM_NAME } from "@/config/platform";

export function generateMetadata(): Metadata {
  return buildMarketingMetadata({ title: "Privacy policy", description: "Privacy policy for {PLATFORM_NAME}.".replace("{PLATFORM_NAME}", PLATFORM_NAME), path: "/privacy", origin: siteOrigin() });
}

export default function Page() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h1 className="font-brand text-4xl font-extrabold tracking-tight text-brand-ink">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted">Summary version. The full legal text is provided with your subscription agreement.</p>
      <p className="mt-8 leading-relaxed">We collect only what we need to run your store: account details, store content you upload, and order data your customers submit at checkout. Payment card details are handled by the payment gateway and never stored by us. Store data is isolated per store, encrypted in transit, and access by our staff is limited, time-boxed and audited. You can export or delete your store data at any time by contacting support.</p>
    </article>
  );
}
