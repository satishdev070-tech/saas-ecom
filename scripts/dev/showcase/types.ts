/**
 * Showcase demo stores (DEV / demo only): one per industry, with real CC0 photography
 * (StockSnap via Openverse), realistic INR pricing and category-specific specifications.
 * Reviews are deliberately NOT seeded: a demo store shows no ratings rather than fake ones.
 */
import type { ProductType } from "../../../src/features/catalog/constants";
import type { IndustrySlug } from "../../../src/features/stores/industries";

/** Openverse search. `pick` indexes the vetted results (first = main image). */
export type Img = { q: string; pick?: number[]; source?: "stocksnap" | "wikimedia" | "rawpixel" };

export type ShowProduct = {
  title: string;
  category: string;
  /** Catalogue product type (defaults to "other"); apparel types drive size-aware storefront UI. */
  type?: ProductType;
  /** Rupees. */
  price: number;
  mrp?: number;
  brand?: string;
  /** Up to two options, e.g. [["Colour", ["Black", "Sand"]], ["Size", ["S", "M"]]]; swatches as "Name|#hex". */
  options?: [string, string[]][];
  short: string;
  description: string;
  specs: [string, string][];
  tags: string[];
  collections?: string[];
  featured?: boolean;
  care?: string;
  weightGrams: number;
  hsn: string;
  img: Img;
};

/** A home-page content slot: section type + settings, with "$…" placeholders resolved by the seeder. */
export type Slot = [type: string, settings: Record<string, unknown>];

export type ShowcaseSpec = {
  slug: string;
  name: string;
  industry: IndustrySlug;
  owner: string;
  /** Theme published by default (key from the marketplace catalog, same industry). */
  theme: string;
  tagline: string;
  story: string[];
  email: string;
  phone: string;
  address: { line1: string; city: string; state: string; postal_code: string };
  legalName: string;
  seo: { title: string; description: string };
  announcement: string[];
  categories: { slug: string; name: string; description: string }[];
  collections: { slug: string; title: string; description: string; tag?: string }[];
  menu: { title: string; to: string; children?: { title: string; to: string }[] }[];
  faqs: [string, string][];
  shippingNote: string;
  returnsNote: string;
  /** Non-product imagery: hero slides, feature stories, promo tiles, lookbook… */
  images: Record<string, Img>;
  /** Content pool: every slot the industry's themes reference. */
  slots: Record<string, Slot>;
  products: ShowProduct[];
};
