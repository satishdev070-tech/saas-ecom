/**
 * Store / business categories ("industries"). Mirrors the store_categories table seeded by
 * migration 1800, so the theme marketplace can filter by industry without a database round
 * trip. Add a category here and in a migration together.
 */
export const INDUSTRIES = [
  { slug: "fashion", name: "Fashion & Clothing", short: "Fashion" },
  { slug: "electronics", name: "Electronics & Gadgets", short: "Electronics" },
  { slug: "beauty", name: "Beauty & Cosmetics", short: "Beauty" },
  { slug: "jewellery", name: "Jewellery & Accessories", short: "Jewellery" },
  { slug: "furniture", name: "Home & Furniture", short: "Furniture" },
  { slug: "grocery", name: "Grocery & Food", short: "Grocery" },
  { slug: "health", name: "Health & Wellness", short: "Health" },
  { slug: "sports", name: "Sports & Fitness", short: "Sports" },
  { slug: "footwear", name: "Footwear", short: "Footwear" },
  { slug: "kids", name: "Kids & Baby", short: "Kids" },
  { slug: "books", name: "Books & Stationery", short: "Books" },
  { slug: "pets", name: "Pet Supplies", short: "Pets" },
  { slug: "automotive", name: "Automotive Accessories", short: "Automotive" },
  { slug: "smart-home", name: "Smart Home & Appliances", short: "Smart Home" },
  { slug: "handicrafts", name: "Handicrafts & Ethnic", short: "Handicrafts" },
  { slug: "bags", name: "Bags & Travel", short: "Bags" },
  { slug: "watches", name: "Watches & Luxury Accessories", short: "Watches" },
  { slug: "organic", name: "Organic & Natural Products", short: "Organic" },
  { slug: "gourmet", name: "Bakery & Gourmet Food", short: "Gourmet" },
  { slug: "general", name: "General / Multi-category", short: "General" },
] as const;

export type IndustrySlug = (typeof INDUSTRIES)[number]["slug"];
export const INDUSTRY_SLUGS = INDUSTRIES.map((i) => i.slug) as IndustrySlug[];
export const isIndustry = (v: string): v is IndustrySlug => (INDUSTRY_SLUGS as string[]).includes(v);
export const industryName = (slug: IndustrySlug) => INDUSTRIES.find((i) => i.slug === slug)!.name;
export const industryShort = (slug: IndustrySlug) => INDUSTRIES.find((i) => i.slug === slug)!.short;
