import type { Metadata } from "next";
import { canonicalUrl } from "./urls";

/** SEO helpers (pure): metadata builders and JSON-LD documents. */

export type SeoFields = { title?: string; description?: string; ogImagePath?: string; noindex?: boolean; canonical?: string; googleVerification?: string; bingVerification?: string };

/** Reads the `seo` jsonb columns ({title, description, og_image_path, noindex}) defensively. */
export function readSeo(value: unknown): SeoFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);
  return {
    title: str(v.title, 120),
    description: str(v.description, 320),
    ogImagePath: str(v.og_image_path, 300) ?? str(v.image_path, 300),
    noindex: v.noindex === true,
    canonical: typeof v.canonical === "string" && /^(\/[^\s]*|https:\/\/[^\s]+)$/.test(v.canonical) ? v.canonical.slice(0, 300) : undefined,
    googleVerification: typeof v.google_verification === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(v.google_verification) ? v.google_verification : undefined,
    bingVerification: typeof v.bing_verification === "string" && /^[A-Za-z0-9]{10,64}$/.test(v.bing_verification) ? v.bing_verification : undefined,
  };
}

/** Plain-text description, whitespace-collapsed and cut at a word boundary. */
export function toDescription(text: string | null | undefined, max = 160): string | undefined {
  if (!text) return undefined;
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

export type PageMetaInput = {
  primaryHost: string;
  path: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  noindex?: boolean;
  type?: "website" | "article";
  siteName: string;
  /** Seller override: a path on this store or an absolute https URL. */
  canonical?: string;
};

export function buildPageMetadata(i: PageMetaInput): Metadata {
  const url = canonicalUrl(i.primaryHost, i.path);
  const canonical = i.canonical ? (i.canonical.startsWith("/") ? canonicalUrl(i.primaryHost, i.canonical) : i.canonical) : url;
  const images = i.imageUrl ? [{ url: i.imageUrl }] : undefined;
  return {
    title: i.title,
    description: i.description,
    alternates: { canonical },
    robots: i.noindex ? { index: false, follow: true } : undefined,
    openGraph: { type: i.type ?? "website", url, title: i.title, description: i.description, siteName: i.siteName, images, locale: "en_IN" },
    twitter: { card: images ? "summary_large_image" : "summary", title: i.title, description: i.description, images: i.imageUrl ? [i.imageUrl] : undefined },
  };
}

/** Serialises JSON-LD for a <script type="application/ld+json">; escapes <, > and & so it can't close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(primaryHost: string, items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({ "@type": "ListItem", position: idx + 1, name: it.name, item: canonicalUrl(primaryHost, it.path) })),
  };
}

export type ProductLdInput = {
  primaryHost: string;
  path: string;
  name: string;
  description?: string;
  images: string[];
  sku?: string | null;
  brand?: string | null;
  storeName: string;
  /** paise */
  lowPriceMinor: number;
  highPriceMinor: number;
  offerCount: number;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
};

const rupees = (minor: number) => (minor / 100).toFixed(2);

export function productJsonLd(p: ProductLdInput) {
  const url = canonicalUrl(p.primaryHost, p.path);
  const availability = p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const offers =
    p.offerCount > 1 && p.lowPriceMinor !== p.highPriceMinor
      ? { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: rupees(p.lowPriceMinor), highPrice: rupees(p.highPriceMinor), offerCount: p.offerCount, availability, url }
      : { "@type": "Offer", priceCurrency: "INR", price: rupees(p.lowPriceMinor), availability, url, itemCondition: "https://schema.org/NewCondition" };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.images.length ? p.images : undefined,
    sku: p.sku ?? undefined,
    url,
    brand: { "@type": "Brand", name: p.brand || p.storeName },
    offers,
    aggregateRating: p.ratingCount > 0 ? { "@type": "AggregateRating", ratingValue: p.ratingAvg.toFixed(1), reviewCount: p.ratingCount, bestRating: 5, worstRating: 1 } : undefined,
  };
}

/** WebSite document with the store search as a SearchAction (sitelinks search box). */
export function websiteJsonLd(primaryHost: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: canonicalUrl(primaryHost, "/"),
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${canonicalUrl(primaryHost, "/search")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

/** robots.txt body for a storefront host. */
export function robotsTxt(opts: { primaryHost: string; allowIndexing: boolean }): string {
  if (!opts.allowIndexing) return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /account",
    "Disallow: /orders",
    "Disallow: /search",
    "Disallow: /*?*sort=",
    "",
    `Sitemap: ${canonicalUrl(opts.primaryHost, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

export type SitemapEntry = { path: string; lastModified?: string | null };

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function sitemapXml(primaryHost: string, entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastModified ? `<lastmod>${xmlEscape(new Date(e.lastModified).toISOString())}</lastmod>` : "";
      return `<url><loc>${xmlEscape(canonicalUrl(primaryHost, e.path))}</loc>${lastmod}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
