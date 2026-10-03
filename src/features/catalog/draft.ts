import { PRODUCT_STATUSES, PRODUCT_TYPES, type ProductStatus, type ProductType } from "./constants";
import { dbMoneyToMinor, minorToInput } from "./format";
import type { ProductDraft } from "./types";
import type { OptionDraft, VariantDraft } from "./variants";

/**
 * Pure conversion from database rows to the editor model (ProductDraft). Used by the
 * editor page, CSV import (merge onto existing products) and CSV export.
 */

export type DbProduct = {
  id: string;
  updated_at: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  product_type: string;
  brand: string | null;
  category_id: string | null;
  size_chart_id: string | null;
  status: string;
  featured: boolean;
  tags: string[] | null;
  attributes: unknown;
  care_instructions: string | null;
  shipping_info: string | null;
  return_info: string | null;
  hsn_code: string | null;
  seo: unknown;
};
export type DbOption = { id: string; product_id: string; position: number; name: string };
export type DbOptionValue = { option_id: string; value: string; swatch: string | null; position: number };
export type DbVariant = {
  id: string;
  product_id: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  cost_price: number | string | null;
  weight_grams: number;
  track_inventory: boolean;
  allow_backorder: boolean;
  low_stock_threshold: number | null;
  status: string;
  position: number;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function dbToDraft(p: DbProduct, options: DbOption[], values: DbOptionValue[], variants: DbVariant[]): ProductDraft {
  const attrs = obj(p.attributes);
  const seo = obj(p.seo);
  const opts = [...options].sort((a, b) => a.position - b.position).slice(0, 3);
  const keys = ["option1", "option2", "option3"] as const;
  const vs = [...variants]
    .sort((a, b) => a.position - b.position)
    // variants must match the option count; stray rows (bad data) are left out of the editor
    .filter((v) => keys.every((k, i) => (i < opts.length ? !!v[k] : !v[k])));

  // Option values: stored values first, then any value an ACTIVE variant uses that is
  // missing (e.g. imported data without product_option_values rows).
  const optionDrafts: OptionDraft[] = opts.map((o, i) => {
    const vals = values
      .filter((v) => v.option_id === o.id)
      .sort((a, b) => a.position - b.position)
      .map((v) => ({ value: v.value, swatch: v.swatch ?? "" }));
    for (const v of vs) {
      const val = v[keys[i]!];
      if (v.status === "active" && val && !vals.some((x) => x.value === val)) vals.push({ value: val, swatch: "" });
    }
    return { name: o.name, values: vals };
  });

  const variantDrafts: VariantDraft[] = vs
    // Archived variants whose option values were removed are hidden: save_product keeps them
    // archived (they have orders) and revives them if the combination is added back.
    .filter((v) => v.status === "active" || keys.every((k, i) => i >= optionDrafts.length || optionDrafts[i]!.values.some((x) => x.value === v[k])))
    .map((v) => ({
      id: v.id,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
      price: minorToInput(dbMoneyToMinor(v.price)),
      compareAtPrice: minorToInput(dbMoneyToMinor(v.compare_at_price)),
      costPrice: minorToInput(dbMoneyToMinor(v.cost_price)),
      weightGrams: String(v.weight_grams),
      trackInventory: v.track_inventory,
      allowBackorder: v.allow_backorder,
      lowStockThreshold: v.low_stock_threshold === null ? "" : String(v.low_stock_threshold),
      status: v.status === "archived" ? "archived" : "active",
      initialStock: "",
    }));

  const occasion = Array.isArray(attrs.occasion) ? attrs.occasion.filter((x): x is string => typeof x === "string") : [];
  return {
    id: p.id,
    expectedUpdatedAt: p.updated_at,
    title: p.title,
    slug: p.slug,
    description: p.description ?? "",
    shortDescription: p.short_description ?? "",
    productType: (PRODUCT_TYPES as readonly string[]).includes(p.product_type) ? (p.product_type as ProductType) : "other",
    brand: p.brand ?? "",
    categoryId: p.category_id,
    sizeChartId: p.size_chart_id,
    status: (PRODUCT_STATUSES as readonly string[]).includes(p.status) ? (p.status as ProductStatus) : "draft",
    featured: p.featured,
    tags: p.tags ?? [],
    attributes: {
      fabric: str(attrs.fabric),
      style: str(attrs.style),
      length: str(attrs.length),
      work: str(attrs.work),
      pattern: str(attrs.pattern),
      occasion,
      specs: (Array.isArray(attrs.specs) ? attrs.specs : [])
        .map((x) => obj(x))
        .filter((x) => typeof x.label === "string" && typeof x.value === "string")
        .slice(0, 30)
        .map((x) => ({ label: str(x.label), value: str(x.value) })),
    },
    careInstructions: p.care_instructions ?? "",
    shippingInfo: p.shipping_info ?? "",
    returnInfo: p.return_info ?? "",
    hsnCode: p.hsn_code ?? "",
    seoTitle: str(seo.title),
    seoDescription: str(seo.description),
    seoCanonical: str(seo.canonical),
    seoNoindex: seo.noindex === true,
    options: optionDrafts,
    variants: variantDrafts,
  };
}
