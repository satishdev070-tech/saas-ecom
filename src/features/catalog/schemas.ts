import { z } from "zod";
import { slug } from "@/lib/validation/common";
import { toDecimalString, toMinor } from "@/lib/money";
import {
  CATEGORY_STATUSES,
  COLLECTION_SORTS,
  COLLECTION_STATUSES,
  COLLECTION_TYPES,
  MAX_OPTION_VALUES,
  MAX_TAGS,
  MAX_VARIANTS,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  VARIANT_STATUSES,
} from "./constants";

export const PRODUCT_SORTS = ["updated_desc", "created_desc", "title_asc", "title_desc", "price_asc", "price_desc"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  updated_desc: "Recently updated",
  created_desc: "Newest",
  title_asc: "Title A–Z",
  title_desc: "Title Z–A",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};
import { collectionRulesSchema } from "./collection-rules";
import { comboKey } from "./variants";

/* ------------------------------------------------------------------ helpers */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v);

/** Optional trimmed text; "" and null become null. */
export const optText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Use at most ${max} characters`).optional()).transform((v) => v ?? null);

/** Rupee amount typed by a person ("1499", "1,499.50") -> integer paise. */
export const rupees = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,₹\s]/g, ""))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount like 1499 or 1499.50"))
  .transform((v) => toMinor(v));
export const optRupees = z.preprocess((v) => (typeof v === "number" ? String(v) : blankToUndefined(v)), rupees.optional()).transform((v) => v ?? null);

const optInt = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int("Use a whole number").min(min).max(max).optional()).transform((v) => v ?? null);

const optUuid = z.preprocess(blankToUndefined, z.uuid().optional()).transform((v) => v ?? null);

/** Tags: trimmed, lowercased, no characters that would break array/filter syntax. */
export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(40, "Tags can be at most 40 characters")
  .regex(/^[^{}",\\()]+$/, "Tags can't contain { } \" , \\ ( )");

export function normalizeTags(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : input.split(/[,;\n]/);
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.trim().toLowerCase().replace(/[{}",\\()]/g, "").slice(0, 40).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

const hsn = z.preprocess(blankToUndefined, z.string().trim().regex(/^[0-9]{4,8}$/, "HSN codes are 4–8 digits").optional()).transform((v) => v ?? null);
const swatch = z.preprocess(blankToUndefined, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #b03060").optional()).transform((v) => v?.toLowerCase() ?? null);

/* ------------------------------------------------------------------ product */

export const optionSchema = z.object({
  name: z.string().trim().min(1, "Name the option").max(40),
  values: z
    .array(z.object({ value: z.string().trim().min(1, "Enter a value").max(60), swatch }))
    .min(1, "Add at least one value")
    .max(MAX_OPTION_VALUES),
});

export const variantSchema = z.object({
  id: optUuid,
  option1: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()).transform((v) => v ?? null),
  option2: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()).transform((v) => v ?? null),
  option3: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()).transform((v) => v ?? null),
  sku: z.preprocess(blankToUndefined, z.string().trim().max(64).regex(/^[A-Za-z0-9._\-/]+$/, "Use letters, numbers, - _ . /").optional()).transform((v) => v ?? null),
  barcode: optText(64),
  price: z.preprocess((v) => (typeof v === "number" ? String(v) : v), rupees),
  compareAtPrice: optRupees,
  costPrice: optRupees,
  weightGrams: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(100_000).default(500)),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  lowStockThreshold: optInt(0, 100_000),
  status: z.enum(VARIANT_STATUSES).default("active"),
  initialStock: optInt(0, 1_000_000),
});

export const attributesSchema = z.object({
  fabric: optText(80),
  style: optText(80),
  length: optText(80),
  work: optText(80),
  pattern: optText(80),
  occasion: z.array(z.string().trim().min(1).max(40)).max(10, "Choose at most 10 occasions").default([]),
  /** Category-specific specifications (e.g. Battery life, Material, Net weight). */
  specs: z.preprocess(
    // Rows left completely blank in the editor are dropped, not errors.
    (v) => (Array.isArray(v) ? v.filter((x) => !(x && typeof x === "object" && !String((x as { label?: unknown }).label ?? "").trim() && !String((x as { value?: unknown }).value ?? "").trim())) : v),
    z
    .array(z.object({ label: z.string().trim().min(1, "Enter a label").max(40), value: z.string().trim().min(1, "Enter a value").max(200) }))
    .max(30, "Use at most 30 specifications")
    .default([]),
  ),
});

export const productInputSchema = z
  .object({
    id: optUuid,
    expectedUpdatedAt: optText(64),
    title: z.string().trim().min(1, "Enter a title").max(200),
    slug: slug,
    description: optText(20_000),
    shortDescription: optText(500),
    productType: z.enum(PRODUCT_TYPES),
    brand: optText(120),
    categoryId: optUuid,
    sizeChartId: optUuid,
    status: z.enum(PRODUCT_STATUSES),
    featured: z.boolean().default(false),
    tags: z.array(tagSchema).max(MAX_TAGS, `Use at most ${MAX_TAGS} tags`).default([]),
    attributes: attributesSchema,
    careInstructions: optText(2000),
    shippingInfo: optText(2000),
    returnInfo: optText(2000),
    hsnCode: hsn,
    seoTitle: optText(120),
    seoDescription: optText(320),
    seoCanonical: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(300).regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, "Use a path like /products/kurta or a full https:// URL").optional()),
    seoNoindex: z.boolean().default(false),
    options: z.array(optionSchema).max(3, "Use at most 3 options").default([]),
    variants: z.array(variantSchema).min(1, "Add at least one variant").max(MAX_VARIANTS, `Use at most ${MAX_VARIANTS} variants`),
  })
  .superRefine((p, ctx) => {
    // option names and values unique
    const names = new Set<string>();
    p.options.forEach((o, i) => {
      const k = o.name.toLowerCase();
      if (names.has(k)) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "Option names must be unique" });
      names.add(k);
      const vals = new Set<string>();
      o.values.forEach((v, j) => {
        if (vals.has(v.value.toLowerCase())) ctx.addIssue({ code: "custom", path: ["options", i, "values", j, "value"], message: "Duplicate value" });
        vals.add(v.value.toLowerCase());
      });
    });
    if (p.options.length === 0 && p.variants.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "A product without options has exactly one variant" });
    }
    const combos = new Set<string>();
    const skus = new Map<string, number>();
    p.variants.forEach((v, i) => {
      const vals = [v.option1, v.option2, v.option3];
      for (let pos = 0; pos < 3; pos++) {
        const opt = p.options[pos];
        const val = vals[pos];
        if (opt && (!val || !opt.values.some((x) => x.value === val))) {
          ctx.addIssue({ code: "custom", path: ["variants", i, `option${pos + 1}`], message: `Choose a ${opt.name} value` });
        } else if (!opt && val) {
          ctx.addIssue({ code: "custom", path: ["variants", i, `option${pos + 1}`], message: "This option doesn't exist" });
        }
      }
      const key = comboKey(v);
      if (combos.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i], message: "Duplicate variant" });
      combos.add(key);
      if (v.sku) {
        const k = v.sku.toUpperCase();
        if (skus.has(k)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "SKU is used by another variant" });
        skus.set(k, i);
      }
      if (v.compareAtPrice !== null && v.compareAtPrice < v.price) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "compareAtPrice"], message: "MRP must be at least the price" });
      }
    });
    if (p.status === "active" && !p.variants.some((v) => v.status === "active")) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "An active product needs at least one active variant" });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

/** Snake-case JSON for public.save_product(); money as decimal strings. */
export function toSaveProductPayload(p: ProductInput, opts: { allowInitialStock: boolean }) {
  const attributes: Record<string, string | string[] | { label: string; value: string }[]> = {};
  for (const k of ["fabric", "style", "length", "work", "pattern"] as const) {
    const v = p.attributes[k];
    if (v) attributes[k] = v;
  }
  if (p.attributes.occasion.length) attributes.occasion = p.attributes.occasion;
  if (p.attributes.specs.length) attributes.specs = p.attributes.specs;
  const seo: Record<string, string> = {};
  if (p.seoTitle) seo.title = p.seoTitle;
  if (p.seoDescription) seo.description = p.seoDescription;
  if (p.seoCanonical) seo.canonical = p.seoCanonical;
  const seoJson: Record<string, string | boolean> = { ...seo, ...(p.seoNoindex ? { noindex: true } : {}) };
  return {
    id: p.id,
    expected_updated_at: p.expectedUpdatedAt,
    product: {
      title: p.title,
      slug: p.slug,
      description: p.description,
      short_description: p.shortDescription,
      product_type: p.productType,
      brand: p.brand,
      category_id: p.categoryId,
      size_chart_id: p.sizeChartId,
      status: p.status,
      featured: p.featured,
      tags: p.tags,
      attributes,
      care_instructions: p.careInstructions,
      shipping_info: p.shippingInfo,
      return_info: p.returnInfo,
      hsn_code: p.hsnCode,
      seo: seoJson,
    },
    options: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => ({ value: v.value, swatch: v.swatch })) })),
    variants: p.variants.map((v) => ({
      id: v.id,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      sku: v.sku,
      barcode: v.barcode,
      price: toDecimalString(v.price),
      compare_at_price: v.compareAtPrice === null ? null : toDecimalString(v.compareAtPrice),
      cost_price: v.costPrice === null ? null : toDecimalString(v.costPrice),
      weight_grams: v.weightGrams,
      track_inventory: v.trackInventory,
      allow_backorder: v.allowBackorder,
      low_stock_threshold: v.lowStockThreshold,
      status: v.status,
      initial_stock: opts.allowInitialStock && !v.id ? v.initialStock : null,
    })),
  };
}

/* ------------------------------------------------------------------ list / bulk */

export const productListQuerySchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(blankToUndefined, z.enum(PRODUCT_STATUSES).optional()).catch(undefined),
  type: z.preprocess(blankToUndefined, z.enum(PRODUCT_TYPES).optional()).catch(undefined),
  category: z.preprocess(blankToUndefined, z.uuid().optional()).catch(undefined),
  collection: z.preprocess(blankToUndefined, z.uuid().optional()).catch(undefined),
  sort: z.enum(PRODUCT_SORTS).catch("updated_desc").default("updated_desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const BULK_PRODUCT_OPS = ["publish", "unpublish", "archive", "delete"] as const;
export type BulkProductOp = (typeof BULK_PRODUCT_OPS)[number];

export const bulkProductSchema = z.object({
  op: z.enum(BULK_PRODUCT_OPS, { error: "Choose an action" }),
  ids: z.array(z.uuid()).min(1, "Select at least one product").max(100, "Select at most 100 products at a time"),
});

export const productStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(PRODUCT_STATUSES),
});

export const idSchema = z.object({ id: z.uuid() });

/** Editor submission: the ProductDraft as JSON plus manual-collection memberships. */
export const productEnvelopeSchema = z.object({
  payload: z
    .string()
    .max(900_000, "This product is too large to save in one go")
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "The form data was invalid. Reload the page and try again." });
        return z.NEVER;
      }
    }),
  collectionIds: z.array(z.uuid()).max(200).default([]),
});

export const pickerSearchSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  exclude: z.array(z.uuid()).max(1000).default([]),
});

/* ------------------------------------------------------------------ categories */

export const categorySchema = z.object({
  id: optUuid,
  name: z.string().trim().min(1, "Enter a name").max(120),
  slug,
  description: optText(5000),
  parentId: optUuid,
  status: z.enum(CATEGORY_STATUSES),
  position: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(100_000).default(0)),
  seoTitle: optText(120),
  seoDescription: optText(320),
  removeImage: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

/* ------------------------------------------------------------------ collections */

export const collectionSchema = z
  .object({
    id: optUuid,
    title: z.string().trim().min(1, "Enter a title").max(160),
    slug,
    description: optText(5000),
    type: z.enum(COLLECTION_TYPES),
    sortOrder: z.enum(COLLECTION_SORTS),
    status: z.enum(COLLECTION_STATUSES),
    seoTitle: optText(120),
    seoDescription: optText(320),
    rules: z.preprocess((v) => {
      if (typeof v !== "string") return v ?? { match: "all", conditions: [] };
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }, collectionRulesSchema),
    productIds: z.preprocess((v) => {
      if (typeof v !== "string") return v ?? [];
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }, z.array(z.uuid()).max(1000)),
    removeImage: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .superRefine((c, ctx) => {
    if (c.type === "automated" && c.rules.conditions.length === 0) {
      ctx.addIssue({ code: "custom", path: ["rules"], message: "Add at least one condition" });
    }
  });

/* ------------------------------------------------------------------ size charts */

export const sizeChartDataSchema = z
  .object({
    columns: z.array(z.string().trim().min(1, "Name every column").max(40)).min(1, "Add at least one column").max(12),
    rows: z.array(z.array(z.string().trim().max(40))).max(60),
    note: optText(1000),
  })
  .superRefine((c, ctx) => {
    c.rows.forEach((r, i) => {
      if (r.length !== c.columns.length) ctx.addIssue({ code: "custom", path: ["rows", i], message: "Row has the wrong number of cells" });
    });
  });

export const sizeChartSchema = z.object({
  id: optUuid,
  name: z.string().trim().min(1, "Enter a name").max(120),
  unit: z.enum(["in", "cm"]),
  chart: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, sizeChartDataSchema),
});

/* ------------------------------------------------------------------ media */

export const mediaUpdateSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  altText: optText(300),
  variantId: optUuid,
});

export const mediaUploadSchema = z.object({
  productId: z.uuid(),
  altText: optText(300),
});

export const mediaReorderSchema = z.object({
  productId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(100),
});

export const mediaDeleteSchema = z.object({ id: z.uuid(), productId: z.uuid() });
