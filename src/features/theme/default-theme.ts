import { defaultSettings } from "./sections/definitions";
import type { SectionInstance, SectionType, SectionVisibility } from "./sections/types";
import { resolveThemeConfig, type ThemeConfig } from "./schema/config";

/**
 * "Aangan" — the V1 premium Indian fashion theme. Editorial: warm ivory ground, deep ink text,
 * madder-red accents, high-contrast serif headings, generous whitespace, tall product imagery.
 * No tenant content is hard-coded: every data section reads the tenant's own catalog.
 */

export const DEFAULT_THEME_KEY = "aangan";

const both: SectionVisibility = { desktop: true, mobile: true };

function s(id: string, type: SectionType, settings: Record<string, unknown> = {}, visibility: SectionVisibility = both): SectionInstance {
  return { id, type, settings: { ...defaultSettings(type), ...settings }, visibility };
}

const RAW_DEFAULT = {
  schemaVersion: 1,
  tokens: {},
  header: {},
  productCard: {},
  layout: {
    header: [
      s("announcement", "AnnouncementBar", {
        messages: [
          { text: "Free shipping on orders above ₹1,499", href: "" },
          { text: "Cash on delivery available", href: "" },
        ],
      }),
      s("header", "Header", { layout: "logo-center", showInlineMenu: false }),
      s("mega-menu", "MegaMenu", { menuHandle: "main" }, { desktop: true, mobile: false }),
    ],
    footer: [s("footer", "Footer")],
  },
  templates: {
    home: [
      s("hero", "Hero"),
      s("category-tiles", "CategoryGrid", { eyebrow: "Shop by category", heading: "Find your silhouette" }),
      s("new-arrivals", "NewArrivals", { eyebrow: "Just in", heading: "New arrivals", viewAllHref: "/search?sort=newest" }),
      s("featured-collection", "ProductGrid", { eyebrow: "Featured", heading: "The edit", source: "featured", limit: 8 }),
      s("editorial", "EditorialImageText", {
        eyebrow: "The craft",
        heading: "Printed by hand, one block at a time",
        body: "Every piece is hand block printed by artisan families using natural dyes and time-honoured techniques. Small batches, honest fabrics, and prints that age beautifully.",
        ctaLabel: "Our story",
        ctaHref: "/pages/about",
      }),
      s("bestsellers", "Bestseller", { eyebrow: "Most loved", heading: "Bestsellers" }),
      s("occasions", "CollectionGrid", { eyebrow: "Shop by occasion", heading: "Dressed for every moment" }),
      s("trust", "TrustBadges"),
      s("reviews", "Reviews"),
      s("social", "SocialProof"),
      s("newsletter", "Newsletter"),
    ],
    collection: [],
    product: [s("product-trust", "TrustBadges", { tone: "muted" })],
  },
};

/** Fully parsed default config (validated through the same parser the renderer uses). */
export const DEFAULT_THEME_CONFIG: ThemeConfig = resolveThemeConfig(RAW_DEFAULT).config;
