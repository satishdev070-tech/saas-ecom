/** Catalog enums mirrored from the SQL check constraints (supabase/migrations/…0300_catalog_inventory.sql). */

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
  kurta: "Kurta",
  kurta_set: "Kurta set",
  suit: "Suit set",
  co_ord_set: "Co-ord set",
  dress: "Dress",
  saree: "Saree",
  lehenga: "Lehenga",
  top: "Top",
  shirt: "Shirt",
  bottom: "Bottom",
  dupatta: "Dupatta",
  nightwear: "Nightwear",
  accessory: "Accessory",
  other: "Other",
};

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = { draft: "Draft", active: "Active", archived: "Archived" };
export const PRODUCT_STATUS_TONE: Record<ProductStatus, "neutral" | "success" | "warning"> = { draft: "neutral", active: "success", archived: "warning" };

export const VARIANT_STATUSES = ["active", "archived"] as const;
export const CATEGORY_STATUSES = ["active", "hidden"] as const;
export const COLLECTION_STATUSES = ["draft", "active"] as const;
export const COLLECTION_TYPES = ["manual", "automated"] as const;
export const COLLECTION_SORTS = ["manual", "newest", "price_asc", "price_desc", "best_selling", "title_asc"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export const COLLECTION_SORT_LABELS: Record<CollectionSort, string> = {
  manual: "Manual order",
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  best_selling: "Best selling",
  title_asc: "Title A–Z",
};

/** Structured fashion attributes stored in products.attributes. `occasion` is a list; the rest are single values. */
export const SCALAR_ATTRIBUTES = ["fabric", "style", "length", "work", "pattern"] as const;
export const LIST_ATTRIBUTES = ["occasion"] as const;
export const ATTRIBUTE_KEYS = [...SCALAR_ATTRIBUTES, ...LIST_ATTRIBUTES] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  fabric: "Fabric",
  style: "Style / fit",
  length: "Length",
  work: "Work / craft",
  pattern: "Pattern",
  occasion: "Occasion",
};

export const OCCASIONS = ["Casual", "Work", "Festive", "Wedding", "Party", "Loungewear", "Travel"] as const;

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 50;
export const MAX_VARIANTS = 250;
export const MAX_TAGS = 50;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_MEDIA_PER_PRODUCT = 30;

export const INVENTORY_REASONS = ["received", "adjustment", "correction", "damage", "return", "initial"] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];
export const INVENTORY_REASON_LABELS: Record<string, string> = {
  received: "Received",
  adjustment: "Adjustment",
  correction: "Stock take / correction",
  damage: "Damaged",
  return: "Customer return",
  initial: "Opening stock",
  sale: "Sale",
  cancellation: "Cancellation",
  reservation: "Reserved at checkout",
  release: "Reservation released",
};

/* Suggestions for free-text fashion attributes (datalists in the editor; not enforced). */
export const ATTRIBUTE_SUGGESTIONS: Record<(typeof SCALAR_ATTRIBUTES)[number], readonly string[]> = {
  fabric: ["Cotton", "Mul cotton", "Linen", "Silk", "Chanderi", "Georgette", "Chiffon", "Crepe", "Rayon", "Modal", "Khadi", "Organza", "Velvet", "Kota doria", "Tussar"],
  style: ["Straight", "A-line", "Anarkali", "Angrakha", "Kaftan", "Flared", "Peplum", "Relaxed", "Wrap", "Shirt style"],
  length: ["Hip", "Thigh", "Knee", "Calf", "Ankle", "Floor"],
  work: ["Hand block print", "Dabu print", "Bagru print", "Ajrakh", "Kalamkari", "Chikankari", "Embroidery", "Zari", "Gota patti", "Mirror work", "Bandhani", "Leheriya", "Sequin"],
  pattern: ["Floral", "Geometric", "Solid", "Striped", "Checks", "Paisley", "Abstract", "Polka"],
};

export const OPTION_NAME_SUGGESTIONS = ["Size", "Colour", "Fabric", "Length", "Fit"] as const;
export const SIZE_PRESETS: Record<string, readonly string[]> = {
  "XS – XXL": ["XS", "S", "M", "L", "XL", "XXL"],
  "XS – 3XL": ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  "Free size": ["Free size"],
  "28 – 40": ["28", "30", "32", "34", "36", "38", "40"],
};

export const PRODUCT_PAGE_SIZE = 25;
export const INVENTORY_PAGE_SIZE = 50;
export const MOVEMENT_PAGE_SIZE = 25;
export const MAX_CATEGORY_DEPTH = 4;
/** Seller-facing adjustment reasons accepted by public.adjust_inventory(). */
export const ADJUST_REASONS = ["received", "adjustment", "damage", "correction", "return"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];
