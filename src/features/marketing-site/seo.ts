import type { Metadata } from "next";
import { PLATFORM_NAME } from "@/config/platform";
import { toDecimalString } from "@/lib/money";
import type { MarketingPlan } from "./plans";

/** Pure SEO builders for the marketing site (metadata objects and JSON-LD payloads). */

export const OG_IMAGE_PATH = "/og";
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export const SITE_DESCRIPTION =
  "Create your online store, showcase your products and manage orders, payments and shipping from one dashboard. Build Brighten is an e-commerce platform for Indian businesses.";

type MetadataInput = {
  /** Page title. The home page passes an absolute title; inner pages use the root template. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** Path of the page, e.g. "/pricing". */
  path: string;
  origin: string;
};

function safeUrl(origin: string): URL | undefined {
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

export function buildMarketingMetadata({ title, absoluteTitle = false, description, path, origin }: MetadataInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${PLATFORM_NAME}`;
  const image = { url: OG_IMAGE_PATH, ...OG_IMAGE_SIZE, alt: `${PLATFORM_NAME} — online stores for Indian businesses` };
  return {
    metadataBase: safeUrl(origin),
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: PLATFORM_NAME,
      locale: "en_IN",
      url: path,
      title: socialTitle,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image.url],
    },
    robots: { index: true, follow: true },
  };
}

type JsonLdNode = Record<string, unknown>;

/**
 * Serialises JSON-LD for a `<script type="application/ld+json">` tag. `<` is escaped so a
 * string can never close the script element; `>`/`&` and the JS line separators are
 * escaped too for defence in depth. The output is still valid JSON.
 */
export function serializeJsonLd(data: JsonLdNode | JsonLdNode[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function organizationJsonLd(origin: string): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: PLATFORM_NAME,
    url: origin,
    description: SITE_DESCRIPTION,
    areaServed: "IN",
  };
}

export function softwareApplicationJsonLd(origin: string, plans: readonly MarketingPlan[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PLATFORM_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "E-commerce platform",
    operatingSystem: "Web",
    url: origin,
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${origin}/#organization` },
    ...(plans.length > 0
      ? {
          offers: plans.map((plan) => ({
            "@type": "Offer",
            name: `${plan.name} (monthly)`,
            price: toDecimalString(plan.monthlyMinor),
            priceCurrency: plan.currency,
            url: `${origin}/pricing`,
            category: "subscription",
          })),
        }
      : {}),
  };
}

export function faqJsonLd(faqs: readonly { question: string; answer: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}
