import type { IndustrySlug } from "@/features/stores/industries";

/**
 * Demo / showcase stores used by the theme marketplace. This list is the ONLY set of tenants
 * that may (a) render a marketplace theme in Live Preview and (b) be written by the showcase
 * seeders. Real stores (e.g. the-paliya) are never listed here and are therefore never affected.
 */
export const SHOWCASE_STORES: Record<string, { industry: IndustrySlug; name: string }> = {
  // Real-photography showcase stores (scripts/dev/showcase).
  "kaya-studio": { industry: "fashion", name: "Kaya Studio" },
  voltnest: { industry: "electronics", name: "Voltnest" },
  dewbloom: { industry: "beauty", name: "Dewbloom" },
  "kasa-living": { industry: "furniture", name: "Kasa Living" },
  "harvest-basket": { industry: "grocery", name: "Harvest Basket" },
  suvarna: { industry: "jewellery", name: "Suvarna Jewels" },
  kadam: { industry: "footwear", name: "Kadam Footwear" },
  aarogya: { industry: "health", name: "Aarogya Wellness" },
  "khel-studio": { industry: "sports", name: "Khel Studio" },
  nanhe: { industry: "kids", name: "Nanhe Kids" },
  "pustak-ghar": { industry: "books", name: "Pustak Ghar" },
  "pawdesh": { industry: "pets", name: "Pawdesh Pets" },
  "gearbay": { industry: "automotive", name: "Gearbay Auto" },
  "griha-smart": { industry: "smart-home", name: "Griha Smart" },
  "safarnama": { industry: "bags", name: "Safarnama Bags" },
  "ghadi-co": { industry: "watches", name: "Ghadi & Co" },
  "bhoomi-organics": { industry: "organic", name: "Bhoomi Organics" },
  "crumb-and-co": { industry: "gourmet", name: "Crumb & Co" },
  "sabkuch": { industry: "general", name: "Sabkuch" },
  // Original ethnic-fashion demo stores (scripts/dev/demo-stores).
  chinar: { industry: "fashion", name: "Chinar & Loom" },
  gulaabrang: { industry: "fashion", name: "Gulaab Rang" },
  pinkcity: { industry: "fashion", name: "Pinkcity Threads" },
  mitti: { industry: "handicrafts", name: "Mitti & Maati" },
  rangeela: { industry: "fashion", name: "Rangeela Jaipur" },
  noor: { industry: "fashion", name: "Noor Ethnica" },
  vivaah: { industry: "fashion", name: "Vivaah Couture" },
  studioneel: { industry: "fashion", name: "Studio Neel" },
  desidrip: { industry: "fashion", name: "Desi Drip" },
  anaya: { industry: "fashion", name: "Maison Anaya" },
};

/** Showcase store that previews an industry's themes (real photography, full catalogue). */
export const INDUSTRY_SHOWCASE: Partial<Record<IndustrySlug, string>> = {
  fashion: "kaya-studio",
  electronics: "voltnest",
  beauty: "dewbloom",
  furniture: "kasa-living",
  grocery: "harvest-basket",
  jewellery: "suvarna",
  footwear: "kadam",
  health: "aarogya",
  sports: "khel-studio",
  kids: "nanhe",
  books: "pustak-ghar",
  pets: "pawdesh",
  automotive: "gearbay",
  "smart-home": "griha-smart",
  bags: "safarnama",
  watches: "ghadi-co",
  organic: "bhoomi-organics",
  gourmet: "crumb-and-co",
  general: "sabkuch",
};

export const isShowcaseSlug = (slug: string) => Object.hasOwn(SHOWCASE_STORES, slug);

/**
 * Real stores that must never be touched by demo tooling, whatever their slug: checked by tenant
 * id in addition to the showcase allow-list. The Paliya is a live store.
 */
export const PROTECTED_TENANT_IDS: ReadonlySet<string> = new Set(["71458ab4-6b05-4798-bc95-acfe1fd15420"]);

/** Only showcase (demo) tenants can render a marketplace theme via Live Preview. */
export const canPreviewThemes = (t: { tenantId: string; slug: string }) => isShowcaseSlug(t.slug) && !PROTECTED_TENANT_IDS.has(t.tenantId.toLowerCase());
