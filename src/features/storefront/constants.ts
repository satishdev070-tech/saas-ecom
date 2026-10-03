/** Catalog enumerations mirrored from the database CHECK constraints (0300 catalog). Pure module. */

export const PRODUCT_TYPES = [
  "kurta",
  "kurta_set",
  "suit",
  "co_ord_set",
  "dress",
  "saree",
  "lehenga",
  "top",
  "shirt",
  "bottom",
  "dupatta",
  "nightwear",
  "accessory",
  "other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  kurta: "Kurtas",
  kurta_set: "Kurta sets",
  suit: "Suit sets",
  co_ord_set: "Co-ord sets",
  dress: "Dresses",
  saree: "Sarees",
  lehenga: "Lehengas",
  top: "Tops",
  shirt: "Shirts",
  bottom: "Bottoms",
  dupatta: "Dupattas",
  nightwear: "Nightwear",
  accessory: "Accessories",
  other: "Other",
};

export function productTypeLabel(t: string): string {
  return (PRODUCT_TYPE_LABELS as Record<string, string>)[t] ?? t.replace(/_/g, " ");
}

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "best_selling", label: "Best selling" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;
export type ListingSort = (typeof SORT_OPTIONS)[number]["value"] | "relevance";
