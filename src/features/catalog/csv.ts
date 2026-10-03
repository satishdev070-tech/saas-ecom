import { z } from "zod";
import { slug as slugSchema } from "@/lib/validation/common";
import { MAX_IMPORT_ROWS, PRODUCT_STATUSES, PRODUCT_TYPES } from "./constants";
import { normalizeTags } from "./schemas";
import type { ProductDraft } from "./types";
import { comboKey, emptyVariant, type OptionDraft, type VariantDraft } from "./variants";
import { emptyProductDraft } from "./types";

/* ------------------------------------------------------------------ CSV codec (RFC 4180) */

/** Parses CSV text into rows of cells. Handles quotes, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Serialises one cell. Text that a spreadsheet would treat as a formula (= + - @ tab CR)
 * is prefixed with an apostrophe (CSV injection); plain numbers are left alone.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ product CSV format */

export const PRODUCT_CSV_COLUMNS = [
  "handle",
  "title",
  "status",
  "product_type",
  "brand",
  "category",
  "tags",
  "short_description",
  "description",
  "hsn_code",
  "featured",
  "fabric",
  "occasion",
  "style",
  "length",
  "work",
  "pattern",
  "seo_title",
  "seo_description",
  "option1_name",
  "option1_value",
  "option2_name",
  "option2_value",
  "option3_name",
  "option3_value",
  "sku",
  "barcode",
  "price",
  "compare_at_price",
  "cost_price",
  "weight_grams",
  "track_inventory",
  "allow_backorder",
  "low_stock_threshold",
  "variant_status",
  "stock",
] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optStr = (max: number) => z.preprocess(blank, z.string().trim().max(max, `at most ${max} characters`).optional());
const bool = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => ["true", "false", "yes", "no", "1", "0", "y", "n"].includes(v), "use true or false")
    .transform((v) => ["true", "yes", "1", "y"].includes(v))
    .optional(),
);
const money = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[,₹\s]/g, ""))
    .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "use an amount like 1499.00"))
    .optional(),
);
const int = (min: number, max: number) => z.preprocess(blank, z.coerce.number().int("use a whole number").min(min).max(max).optional());

/** One CSV row after validation (strings kept as the editor expects them). */
export const importRowSchema = z.object({
  handle: slugSchema,
  title: optStr(200),
  status: z.preprocess(blank, z.enum(PRODUCT_STATUSES).optional()),
  product_type: z.preprocess(blank, z.enum(PRODUCT_TYPES).optional()),
  brand: optStr(120),
  category: z.preprocess(blank, slugSchema.optional()),
  tags: optStr(2000),
  short_description: optStr(500),
  description: optStr(20000),
  hsn_code: z.preprocess(blank, z.string().trim().regex(/^[0-9]{4,8}$/, "4–8 digits").optional()),
  featured: bool,
  fabric: optStr(80),
  occasion: optStr(400),
  style: optStr(80),
  length: optStr(80),
  work: optStr(80),
  pattern: optStr(80),
  seo_title: optStr(120),
  seo_description: optStr(320),
  option1_name: optStr(40),
  option1_value: optStr(60),
  option2_name: optStr(40),
  option2_value: optStr(60),
  option3_name: optStr(40),
  option3_value: optStr(60),
  sku: z.preprocess(blank, z.string().trim().max(64).regex(/^[A-Za-z0-9._\-/]+$/, "letters, numbers, - _ . / only").optional()),
  barcode: optStr(64),
  price: money,
  compare_at_price: money,
  cost_price: money,
  weight_grams: int(0, 100_000),
  track_inventory: bool,
  allow_backorder: bool,
  low_stock_threshold: int(0, 100_000),
  variant_status: z.preprocess(blank, z.enum(["active", "archived"]).optional()),
  stock: int(0, 1_000_000),
});
export type ImportRow = z.infer<typeof importRowSchema> & { rowNumber: number };
export type RowError = { row: number; messages: string[] };

/**
 * Validates header + rows. Row numbers are 1-based spreadsheet rows (header = row 1).
 * Unknown columns are ignored; `handle` and at least one of sku/price are required.
 */
export function parseProductCsv(text: string, maxRows = MAX_IMPORT_ROWS): { rows: ImportRow[]; errors: RowError[]; fatal?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: [], fatal: "The file has no data rows." };
  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!header.includes("handle")) return { rows: [], errors: [], fatal: "Missing required column: handle." };
  if (table.length - 1 > maxRows) return { rows: [], errors: [], fatal: `Import at most ${maxRows} rows at a time (this file has ${table.length - 1}).` };
  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  const skus = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    const rec: Record<string, string> = {};
    header.forEach((h, j) => {
      if ((PRODUCT_CSV_COLUMNS as readonly string[]).includes(h)) rec[h] = (cells[j] ?? "").replace(/^'(?=[=+\-@])/, "");
    });
    const parsed = importRowSchema.safeParse(rec);
    if (!parsed.success) {
      errors.push({ row: rowNumber, messages: parsed.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`) });
      return;
    }
    const r = parsed.data;
    const msgs: string[] = [];
    if (r.sku) {
      const k = r.sku.toUpperCase();
      if (skus.has(k)) msgs.push(`sku: duplicate of row ${skus.get(k)}`);
      else skus.set(k, rowNumber);
    }
    if (msgs.length) errors.push({ row: rowNumber, messages: msgs });
    else rows.push({ ...r, rowNumber });
  });
  return { rows, errors };
}

/** Groups rows by handle, keeping file order. */
export function groupByHandle(rows: ImportRow[]): Map<string, ImportRow[]> {
  const m = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const list = m.get(r.handle) ?? [];
    list.push(r);
    m.set(r.handle, list);
  }
  return m;
}

/**
 * Applies a product's CSV rows onto its current draft (or a new one). Product fields are
 * taken from the first row that fills them. Each row updates the variant with the same SKU,
 * else the one with the same option values, else adds a variant. Variants not in the file
 * are left untouched. Returns the merged draft plus per-row stock targets (sku/combo -> qty).
 */
export function mergeImportIntoDraft(
  existing: ProductDraft | null,
  rows: ImportRow[],
  resolveCategory: (slug: string) => string | null,
): { draft: ProductDraft; errors: RowError[]; stock: { key: { sku: string | null; combo: string }; qty: number }[] } {
  const d: ProductDraft = existing ? structuredClone(existing) : { ...emptyProductDraft(), variants: [] };
  const errors: RowError[] = [];
  const first = <K extends keyof ImportRow>(k: K) => rows.find((r) => r[k] !== undefined && r[k] !== "")?.[k];

  const handle = rows[0]!.handle;
  if (!existing) d.slug = handle;
  const title = first("title");
  if (title) d.title = title;
  else if (!existing) errors.push({ row: rows[0]!.rowNumber, messages: ["title: required for a new product"] });
  d.status = first("status") ?? d.status;
  d.productType = first("product_type") ?? d.productType;
  d.brand = first("brand") ?? d.brand;
  const cat = first("category");
  if (cat) {
    const id = resolveCategory(cat);
    if (id) d.categoryId = id;
    else errors.push({ row: rows.find((r) => r.category === cat)!.rowNumber, messages: [`category: no category with handle "${cat}"`] });
  }
  const tags = first("tags");
  if (tags !== undefined) d.tags = normalizeTags(tags);
  d.shortDescription = first("short_description") ?? d.shortDescription;
  d.description = first("description") ?? d.description;
  d.hsnCode = first("hsn_code") ?? d.hsnCode;
  const featured = first("featured");
  if (featured !== undefined) d.featured = featured;
  d.attributes.fabric = first("fabric") ?? d.attributes.fabric;
  d.attributes.style = first("style") ?? d.attributes.style;
  d.attributes.length = first("length") ?? d.attributes.length;
  d.attributes.work = first("work") ?? d.attributes.work;
  d.attributes.pattern = first("pattern") ?? d.attributes.pattern;
  d.seoTitle = first("seo_title") ?? d.seoTitle;
  d.seoDescription = first("seo_description") ?? d.seoDescription;
  const occ = first("occasion");
  if (occ) d.attributes.occasion = occ.split(/[;|]/).map((s) => s.trim()).filter(Boolean).slice(0, 10);

  // options: names from the file (by position) or existing; values appended as seen
  const options: OptionDraft[] = d.options.map((o) => ({ name: o.name, values: o.values.map((v) => ({ ...v })) }));
  for (const n of [1, 2, 3] as const) {
    const name = first(`option${n}_name`);
    if (!name) continue;
    if (!options[n - 1]) {
      if (options.length !== n - 1) {
        errors.push({ row: rows[0]!.rowNumber, messages: [`option${n}_name: set option${n - 1}_name first`] });
        continue;
      }
      // the product had no options: its single default variant becomes the first combination
      options.push({ name, values: [] });
    } else options[n - 1]!.name = name;
  }
  const hadOptions = d.options.length > 0;

  const stock: { key: { sku: string | null; combo: string }; qty: number }[] = [];
  const variants = d.variants.map((v) => ({ ...v }));
  for (const r of rows) {
    const extra = ([r.option1_value, r.option2_value, r.option3_value] as (string | undefined)[]).findIndex((v, i) => !!v && i >= options.length);
    if (extra >= 0) {
      errors.push({ row: r.rowNumber, messages: [`option${extra + 1}_name: required (set it on the first row of this product)`] });
      continue;
    }
    const vals = [r.option1_value ?? null, r.option2_value ?? null, r.option3_value ?? null].slice(0, options.length);
    while (vals.length < 3) vals.push(null);
    const missing = options.findIndex((_, i) => !vals[i]);
    if (missing >= 0 && options.length) {
      errors.push({ row: r.rowNumber, messages: [`option${missing + 1}_value: required (product has option "${options[missing]!.name}")`] });
      continue;
    }
    options.forEach((o, i) => {
      if (!o.values.some((v) => v.value === vals[i])) o.values.push({ value: vals[i]!, swatch: "" });
    });
    const combo = { option1: vals[0] ?? null, option2: vals[1] ?? null, option3: vals[2] ?? null };
    let target =
      (r.sku ? variants.find((v) => v.sku.toUpperCase() === r.sku!.toUpperCase()) : undefined) ??
      variants.find((v) => comboKey(v) === comboKey(combo)) ??
      (!hadOptions && options.length === 0 ? variants[0] : undefined) ??
      // product gains its first option: reuse the old default variant for the first row
      (!hadOptions && options.length > 0 && variants.length === 1 && !variants[0]!.option1 ? variants[0] : undefined);
    if (!target) {
      if (!r.price) {
        errors.push({ row: r.rowNumber, messages: ["price: required for a new variant"] });
        continue;
      }
      target = emptyVariant();
      variants.push(target);
    }
    Object.assign(target, combo);
    const upd: Partial<VariantDraft> = {};
    if (r.sku) upd.sku = r.sku;
    if (r.barcode !== undefined) upd.barcode = r.barcode;
    if (r.price) upd.price = r.price;
    if (r.compare_at_price !== undefined) upd.compareAtPrice = r.compare_at_price;
    if (r.cost_price !== undefined) upd.costPrice = r.cost_price;
    if (r.weight_grams !== undefined) upd.weightGrams = String(r.weight_grams);
    if (r.track_inventory !== undefined) upd.trackInventory = r.track_inventory;
    if (r.allow_backorder !== undefined) upd.allowBackorder = r.allow_backorder;
    if (r.low_stock_threshold !== undefined) upd.lowStockThreshold = String(r.low_stock_threshold);
    if (r.variant_status) upd.status = r.variant_status;
    Object.assign(target, upd);
    if (!target.price) errors.push({ row: r.rowNumber, messages: ["price: required"] });
    if (r.stock !== undefined) stock.push({ key: { sku: target.sku || null, combo: comboKey(target) }, qty: r.stock });
  }
  // an option-less product can only keep one variant; drop leftovers without a combination when options appear
  d.options = options;
  d.variants = options.length ? variants.filter((v) => options.every((_, i) => !![v.option1, v.option2, v.option3][i])) : variants.slice(0, 1);
  if (!d.variants.length) errors.push({ row: rows[0]!.rowNumber, messages: ["No valid variants for this product"] });
  return { draft: d, errors, stock };
}

/* ------------------------------------------------------------------ export */

/**
 * CSV rows (without header) for one product: one row per variant. Product-level fields are
 * written on the first row only (the importer takes each field from the first row that has
 * it); option names are repeated on every row so sorted files still import.
 */
export function productToCsvRows(
  p: ProductDraft,
  extra: { categorySlug: string | null; stockByVariantId?: Map<string, number> },
): string[][] {
  const variants = p.variants.length ? p.variants : [emptyVariant()];
  return variants.map((v, i) => {
    const first = i === 0;
    const rec: Record<ProductCsvColumn, string> = {
      handle: p.slug,
      title: first ? p.title : "",
      status: first ? p.status : "",
      product_type: first ? p.productType : "",
      brand: first ? p.brand : "",
      category: first ? (extra.categorySlug ?? "") : "",
      tags: first ? p.tags.join(", ") : "",
      short_description: first ? p.shortDescription : "",
      description: first ? p.description : "",
      hsn_code: first ? p.hsnCode : "",
      featured: first ? String(p.featured) : "",
      fabric: first ? p.attributes.fabric : "",
      occasion: first ? p.attributes.occasion.join("; ") : "",
      style: first ? p.attributes.style : "",
      length: first ? p.attributes.length : "",
      work: first ? p.attributes.work : "",
      pattern: first ? p.attributes.pattern : "",
      seo_title: first ? p.seoTitle : "",
      seo_description: first ? p.seoDescription : "",
      option1_name: p.options[0]?.name ?? "",
      option1_value: p.options[0] ? (v.option1 ?? "") : "",
      option2_name: p.options[1]?.name ?? "",
      option2_value: p.options[1] ? (v.option2 ?? "") : "",
      option3_name: p.options[2]?.name ?? "",
      option3_value: p.options[2] ? (v.option3 ?? "") : "",
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      compare_at_price: v.compareAtPrice,
      cost_price: v.costPrice,
      weight_grams: v.weightGrams,
      track_inventory: String(v.trackInventory),
      allow_backorder: String(v.allowBackorder),
      low_stock_threshold: v.lowStockThreshold,
      variant_status: v.status,
      stock: v.id && extra.stockByVariantId?.has(v.id) ? String(extra.stockByVariantId.get(v.id)) : "",
    };
    return PRODUCT_CSV_COLUMNS.map((c) => rec[c]);
  });
}

/** Header + rows for many products, ready for toCsv(). */
export function productsToCsv(items: { draft: ProductDraft; categorySlug: string | null; stockByVariantId?: Map<string, number> }[]): string {
  const rows: string[][] = [[...PRODUCT_CSV_COLUMNS]];
  for (const it of items) rows.push(...productToCsvRows(it.draft, it));
  return toCsv(rows);
}
