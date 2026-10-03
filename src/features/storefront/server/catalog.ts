import "server-only";
import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/observability/logger";
import { toMinor } from "@/lib/money";
import { readSeo, type SeoFields } from "../seo";
import type { ListingRpcArgs } from "../filters";
import type { PdpOption, PdpVariant } from "../variants";

/**
 * Public catalog reads for the storefront. Tenant id always comes from the verified host
 * (never from input). Listings run in SQL (storefront_list_products) and return ids only;
 * card data is then read in ONE embedded query + ONE stock call per page (no N+1).
 * The anonymous client means RLS only ever exposes published products of open tenants.
 */

const money = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  try {
    return toMinor(v);
  } catch {
    return null;
  }
};

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  productType: string;
  imagePath: string | null;
  imageAlt: string;
  hoverImagePath: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  hasPriceRange: boolean;
  inStock: boolean;
  isNew: boolean;
  isBestseller: boolean;
  ratingAvg: number;
  ratingCount: number;
  /** Set when the product has exactly one purchasable variant (enables quick add). */
  singleVariantId: string | null;
  /** Values of the product's "Size" option in variant order, with availability and the variant to add (size chips, quick add). */
  sizes: { value: string; inStock: boolean; variantId: string }[];
};

export type ListArgs = Partial<Omit<ListingRpcArgs, "p_sort" | "p_limit" | "p_offset">> & {
  p_collection?: string;
  p_category?: string;
  p_product_ids?: string[];
  p_tags?: string[];
  p_on_sale?: boolean;
  p_featured?: boolean;
  p_exclude?: string;
  p_sort?: string;
  p_limit?: number;
  p_offset?: number;
};

export async function listProductIds(tenantId: string, args: ListArgs): Promise<{ ids: string[]; total: number }> {
  const { data, error } = await createSupabasePublicClient().rpc("storefront_list_products", { p_tenant: tenantId, ...args });
  if (error) {
    logger.error("storefront.list_failed", { tenantId, error: error.message });
    return { ids: [], total: 0 };
  }
  const rows = data ?? [];
  return { ids: rows.map((r) => r.product_id), total: Number(rows[0]?.total_count ?? 0) };
}

const NEW_DAYS = 21;
const CARD_SELECT =
  "id, slug, title, brand, product_type, tags, published_at, rating_avg, rating_count, " +
  "product_media(storage_path, alt_text, media_type, position), product_variants(id, price, compare_at_price, status, position, option1, option2, option3), product_options(name, position)";

type CardRow = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  product_type: string;
  tags: string[];
  published_at: string | null;
  rating_avg: number;
  rating_count: number;
  product_media: { storage_path: string; alt_text: string | null; media_type: string; position: number }[];
  product_variants: { id: string; price: number; compare_at_price: number | null; status: string; position: number; option1?: string | null; option2?: string | null; option3?: string | null }[];
  product_options?: { name: string; position: number }[];
};

/** Size chips: values of the option named like "Size", in variant order, in stock if any variant with that value is. */
export function cardSizes(row: Pick<CardRow, "product_variants" | "product_options">, stock: Map<string, { available: number; inStock: boolean }>): { value: string; inStock: boolean; variantId: string }[] {
  const opt = (row.product_options ?? []).find((o) => /^(size|sizes|साइज)$/i.test(o.name.trim()));
  if (!opt) return [];
  const key = `option${opt.position}` as "option1" | "option2" | "option3";
  const out = new Map<string, { inStock: boolean; variantId: string }>();
  for (const v of [...row.product_variants].filter((x) => x.status === "active").sort((a, b) => a.position - b.position)) {
    const val = v[key];
    if (!val) continue;
    const ok = stock.get(v.id)?.inStock ?? !stock.size;
    const cur = out.get(val);
    // Prefer an in-stock variant for quick add (e.g. the first colour that has this size).
    if (!cur || (!cur.inStock && ok)) out.set(val, { inStock: ok, variantId: v.id });
  }
  return [...out].slice(0, 12).map(([value, x]) => ({ value, ...x }));
}

/** Variant stock for many variants in one call (capped at 500 ids by the SQL function). */
export async function getVariantStock(variantIds: string[]): Promise<Map<string, { available: number; inStock: boolean }>> {
  const out = new Map<string, { available: number; inStock: boolean }>();
  if (variantIds.length === 0) return out;
  const { data, error } = await createSupabasePublicClient().rpc("variant_stock", { p_variant_ids: variantIds.slice(0, 500) });
  if (error) {
    logger.warn("storefront.stock_failed", { error: error.message });
    return out;
  }
  for (const r of data ?? []) out.set(r.variant_id, { available: r.available, inStock: r.in_stock });
  return out;
}

export function toCard(row: CardRow, stock: Map<string, { available: number; inStock: boolean }>, now = Date.now()): ProductCardData | null {
  const variants = row.product_variants.filter((v) => v.status === "active");
  if (variants.length === 0) return null;
  const priced = variants
    .map((v) => ({ id: v.id, price: money(v.price) ?? 0, cmp: money(v.compare_at_price) }))
    .sort((a, b) => a.price - b.price);
  const cheapest = priced[0]!;
  const images = [...row.product_media].filter((m) => m.media_type === "image").sort((a, b) => a.position - b.position);
  const published = row.published_at ? Date.parse(row.published_at) : 0;
  // Unknown stock (e.g. stock call failed) is shown as available: checkout re-checks authoritatively.
  const inStock = variants.some((v) => stock.get(v.id)?.inStock ?? !stock.size);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    productType: row.product_type,
    imagePath: images[0]?.storage_path ?? null,
    imageAlt: images[0]?.alt_text?.trim() || row.title,
    hoverImagePath: images[1]?.storage_path ?? null,
    priceMinor: cheapest.price,
    compareAtMinor: cheapest.cmp !== null && cheapest.cmp > cheapest.price ? cheapest.cmp : null,
    hasPriceRange: priced[priced.length - 1]!.price > cheapest.price,
    inStock,
    isNew: row.tags.includes("new") || (published > 0 && now - published < NEW_DAYS * 86_400_000),
    isBestseller: row.tags.includes("bestseller"),
    ratingAvg: Number(row.rating_avg) || 0,
    ratingCount: row.rating_count ?? 0,
    singleVariantId: variants.length === 1 ? variants[0]!.id : null,
    sizes: cardSizes(row, stock),
  };
}

/** Card data for ids, returned in the SAME order as `ids` (listing order comes from SQL). */
export async function getProductCards(tenantId: string, ids: string[]): Promise<ProductCardData[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createSupabasePublicClient()
    .from("products")
    .select(CARD_SELECT)
    .eq("tenant_id", tenantId)
    .in("id", ids.slice(0, 100))
    .returns<CardRow[]>();
  if (error) {
    logger.error("storefront.cards_failed", { tenantId, error: error.message });
    return [];
  }
  const rows = data ?? [];
  const stock = await getVariantStock(rows.flatMap((r) => r.product_variants.map((v) => v.id)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    const card = row ? toCard(row, stock) : null;
    return card ? [card] : [];
  });
}

export async function listProducts(tenantId: string, args: ListArgs): Promise<{ cards: ProductCardData[]; total: number }> {
  const { ids, total } = await listProductIds(tenantId, args);
  return { cards: await getProductCards(tenantId, ids), total };
}

export type Facets = {
  sizes: string[];
  colours: { value: string; swatch: string | null }[];
  fabrics: string[];
  occasions: string[];
  productTypes: string[];
  priceMinRupees: number | null;
  priceMaxRupees: number | null;
};

export async function getListingFacets(tenantId: string, scope: { collectionId?: string; categoryId?: string; query?: string }): Promise<Facets> {
  const { data, error } = await createSupabasePublicClient().rpc("storefront_listing_facets", {
    p_tenant: tenantId,
    p_collection: scope.collectionId,
    p_category: scope.categoryId,
    p_query: scope.query || undefined,
  });
  if (error) logger.warn("storefront.facets_failed", { tenantId, error: error.message });
  const f = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 60) : []);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    sizes: strings(f.sizes),
    colours: Array.isArray(f.colours)
      ? f.colours.flatMap((c) => {
          if (!c || typeof c !== "object") return [];
          const { value, swatch } = c as Record<string, unknown>;
          if (typeof value !== "string" || !value) return [];
          return [{ value, swatch: typeof swatch === "string" && /^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : null }];
        })
      : [],
    fabrics: strings(f.fabrics).sort((a, b) => a.localeCompare(b)),
    occasions: strings(f.occasions).sort((a, b) => a.localeCompare(b)),
    productTypes: strings(f.product_types),
    priceMinRupees: num(f.price_min),
    priceMaxRupees: num(f.price_max),
  };
}

// -----------------------------------------------------------------------------
// Collections & categories
// -----------------------------------------------------------------------------

export type CollectionSummary = { id: string; title: string; slug: string; description: string | null; imagePath: string | null; seo: SeoFields; updatedAt: string };

export const getCollectionBySlug = cache(async (tenantId: string, slug: string): Promise<CollectionSummary | null> => {
  const { data, error } = await createSupabasePublicClient()
    .from("collections")
    .select("id, title, slug, description, image_path, seo, updated_at")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) logger.error("storefront.collection_failed", { tenantId, error: error.message });
  return data ? { id: data.id, title: data.title, slug: data.slug, description: data.description, imagePath: data.image_path, seo: readSeo(data.seo), updatedAt: data.updated_at } : null;
});

export async function getCollections(tenantId: string, opts: { ids?: string[]; limit?: number } = {}): Promise<CollectionSummary[]> {
  let q = createSupabasePublicClient().from("collections").select("id, title, slug, description, image_path, seo, updated_at").eq("tenant_id", tenantId);
  if (opts.ids) {
    if (opts.ids.length === 0) return [];
    q = q.in("id", opts.ids.slice(0, 50));
  }
  const { data, error } = await q.order("position").order("title").limit(Math.min(opts.limit ?? 50, 200));
  if (error) logger.error("storefront.collections_failed", { tenantId, error: error.message });
  const rows = (data ?? []).map((c) => ({ id: c.id, title: c.title, slug: c.slug, description: c.description, imagePath: c.image_path, seo: readSeo(c.seo), updatedAt: c.updated_at }));
  return opts.ids ? opts.ids.flatMap((id) => rows.filter((r) => r.id === id)) : rows;
}

export type CategorySummary = { id: string; name: string; slug: string; parentId: string | null; description: string | null; imagePath: string | null; seo: SeoFields; updatedAt: string };

const CATEGORY_SELECT = "id, name, slug, parent_id, description, image_path, seo, updated_at";
type CategoryRow = { id: string; name: string; slug: string; parent_id: string | null; description: string | null; image_path: string | null; seo: unknown; updated_at: string };
const toCategory = (c: CategoryRow): CategorySummary => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  parentId: c.parent_id,
  description: c.description,
  imagePath: c.image_path,
  seo: readSeo(c.seo),
  updatedAt: c.updated_at,
});

/** All active categories of the tenant (small table; used for breadcrumbs, grids and sitemap). */
export const getAllCategories = cache(async (tenantId: string): Promise<CategorySummary[]> => {
  const { data, error } = await createSupabasePublicClient().from("categories").select(CATEGORY_SELECT).eq("tenant_id", tenantId).order("position").order("name").limit(500);
  if (error) logger.error("storefront.categories_failed", { tenantId, error: error.message });
  return (data ?? []).map(toCategory);
});

export async function getCategoryBySlug(tenantId: string, slug: string): Promise<{ category: CategorySummary; trail: CategorySummary[]; children: CategorySummary[] } | null> {
  const all = await getAllCategories(tenantId);
  const category = all.find((c) => c.slug === slug);
  if (!category) return null;
  return { category, trail: categoryTrail(all, category.id), children: all.filter((c) => c.parentId === category.id) };
}

/** Ancestors (root first) ending with the category itself. Cycle-safe. */
export function categoryTrail(all: CategorySummary[], id: string | null): CategorySummary[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const trail: CategorySummary[] = [];
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !seen.has(cur.id) && trail.length < 6) {
    seen.add(cur.id);
    trail.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return trail;
}

// -----------------------------------------------------------------------------
// Product detail
// -----------------------------------------------------------------------------

export type SizeChart = { name: string; unit: string; columns: string[]; rows: string[][]; note: string | null };

export type ProductMedia = { id: string; path: string; alt: string; variantId: string | null; width: number | null; height: number | null };

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  productType: string;
  brand: string | null;
  tags: string[];
  attributes: { label: string; value: string }[];
  fabric: string | null;
  occasions: string[];
  care: string | null;
  shippingInfo: string | null;
  returnInfo: string | null;
  seo: SeoFields;
  publishedAt: string | null;
  updatedAt: string;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string | null;
  sizeChart: SizeChart | null;
  options: PdpOption[];
  variants: PdpVariant[];
  media: ProductMedia[];
};

const PRODUCT_SELECT =
  "id, slug, title, description, short_description, product_type, brand, tags, attributes, care_instructions, shipping_info, return_info, seo, published_at, updated_at, rating_avg, rating_count, category_id, " +
  "size_charts(name, unit, chart), " +
  "product_options(position, name, product_option_values(value, swatch, position)), " +
  "product_variants(id, title, sku, option1, option2, option3, price, compare_at_price, position, status), " +
  "product_media(id, storage_path, alt_text, media_type, variant_id, position, width, height)";

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  short_description: string | null;
  product_type: string;
  brand: string | null;
  tags: string[];
  attributes: unknown;
  care_instructions: string | null;
  shipping_info: string | null;
  return_info: string | null;
  seo: unknown;
  published_at: string | null;
  updated_at: string;
  rating_avg: number;
  rating_count: number;
  category_id: string | null;
  size_charts: { name: string; unit: string; chart: unknown } | null;
  product_options: { position: number; name: string; product_option_values: { value: string; swatch: string | null; position: number }[] }[];
  product_variants: { id: string; title: string; sku: string | null; option1: string | null; option2: string | null; option3: string | null; price: number; compare_at_price: number | null; position: number; status: string }[];
  product_media: { id: string; storage_path: string; alt_text: string | null; media_type: string; variant_id: string | null; position: number; width: number | null; height: number | null }[];
};

const ATTRIBUTE_LABELS: Record<string, string> = { fabric: "Fabric", style: "Style", length: "Length", work: "Work", pattern: "Pattern", occasion: "Occasion", fit: "Fit", neck: "Neck", sleeve: "Sleeve" };

export function readAttributes(value: unknown): { label: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    if (k === "specs") continue; // label/value rows, appended below
    const label = ATTRIBUTE_LABELS[k] ?? (/^[a-z_]{1,30}$/.test(k) ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") : null);
    if (!label) continue;
    const text = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" || typeof v === "number" ? String(v) : "";
    if (text.trim()) out.push({ label, value: text.trim().slice(0, 200) });
  }
  // Category-specific specifications (electronics, furniture, beauty, grocery…): [{ label, value }].
  const specs = (value as Record<string, unknown>).specs;
  if (Array.isArray(specs)) {
    for (const s of specs.slice(0, 30)) {
      if (!s || typeof s !== "object") continue;
      const { label, value: v } = s as Record<string, unknown>;
      if (typeof label === "string" && typeof v === "string" && label.trim() && v.trim()) out.push({ label: label.trim().slice(0, 40), value: v.trim().slice(0, 200) });
    }
  }
  return out;
}

export function readSizeChart(value: { name: string; unit: string; chart: unknown } | null): SizeChart | null {
  if (!value || !value.chart || typeof value.chart !== "object") return null;
  const c = value.chart as Record<string, unknown>;
  const cell = (x: unknown) => (typeof x === "string" || typeof x === "number" ? String(x).slice(0, 40) : "");
  const columns = Array.isArray(c.columns) ? c.columns.slice(0, 12).map(cell) : [];
  const rows = Array.isArray(c.rows) ? c.rows.slice(0, 40).filter(Array.isArray).map((r: unknown[]) => r.slice(0, 12).map(cell)) : [];
  if (columns.length === 0 || rows.length === 0) return null;
  return { name: value.name, unit: value.unit === "cm" ? "cm" : "in", columns, rows, note: typeof c.note === "string" ? c.note.slice(0, 500) : null };
}

export const getProductBySlug = cache(async (tenantId: string, slug: string): Promise<ProductDetail | null> => {
  const { data, error } = await createSupabasePublicClient()
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle<ProductRow>();
  if (error) {
    logger.error("storefront.product_failed", { tenantId, error: error.message });
    return null;
  }
  if (!data) return null;

  const activeVariants = data.product_variants.filter((v) => v.status === "active").sort((a, b) => a.position - b.position);
  if (activeVariants.length === 0) return null;
  const stock = await getVariantStock(activeVariants.map((v) => v.id));
  const media = data.product_media
    .filter((m) => m.media_type === "image")
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ id: m.id, path: m.storage_path, alt: m.alt_text?.trim() || data.title, variantId: m.variant_id, width: m.width, height: m.height }));

  const options: PdpOption[] = data.product_options
    .filter((o) => o.position >= 1 && o.position <= 3)
    .sort((a, b) => a.position - b.position)
    .map((o) => {
      const used = new Set(activeVariants.map((v) => [v.option1, v.option2, v.option3][o.position - 1]).filter((x): x is string => !!x));
      const declared = [...o.product_option_values].sort((a, b) => a.position - b.position).filter((v) => used.has(v.value));
      const extra = [...used].filter((u) => !declared.some((d) => d.value === u)).map((value) => ({ value, swatch: null, position: 999 }));
      return {
        name: o.name,
        position: o.position as 1 | 2 | 3,
        values: [...declared, ...extra].map((v) => ({ value: v.value, swatch: v.swatch && /^#[0-9a-fA-F]{6}$/.test(v.swatch) ? v.swatch : null })),
      };
    })
    .filter((o) => o.values.length > 0);

  const variants: PdpVariant[] = activeVariants.map((v) => {
    const s = stock.get(v.id);
    const price = money(v.price) ?? 0;
    const cmp = money(v.compare_at_price);
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      options: [v.option1, v.option2, v.option3],
      priceMinor: price,
      compareAtMinor: cmp !== null && cmp > price ? cmp : null,
      inStock: s ? s.inStock : true,
      available: s ? s.available : null,
      imagePath: media.find((m) => m.variantId === v.id)?.path ?? null,
    };
  });

  const attrs = data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes) ? (data.attributes as Record<string, unknown>) : {};
  const occasion = attrs.occasion;
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    shortDescription: data.short_description,
    productType: data.product_type,
    brand: data.brand,
    tags: data.tags,
    attributes: readAttributes(data.attributes),
    fabric: typeof attrs.fabric === "string" ? attrs.fabric : null,
    occasions: Array.isArray(occasion) ? occasion.filter((x): x is string => typeof x === "string") : typeof occasion === "string" ? [occasion] : [],
    care: data.care_instructions,
    shippingInfo: data.shipping_info,
    returnInfo: data.return_info,
    seo: readSeo(data.seo),
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    ratingAvg: Number(data.rating_avg) || 0,
    ratingCount: data.rating_count ?? 0,
    categoryId: data.category_id,
    sizeChart: readSizeChart(data.size_charts),
    options,
    variants,
    media,
  };
});

/** Minimal product references (slug/title/image) for links, lookbooks and review cards. */
export async function getProductRefs(tenantId: string, ids: string[]): Promise<Map<string, { slug: string; title: string }>> {
  const out = new Map<string, { slug: string; title: string }>();
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return out;
  const { data, error } = await createSupabasePublicClient().from("products").select("id, slug, title").eq("tenant_id", tenantId).in("id", unique);
  if (error) logger.warn("storefront.product_refs_failed", { tenantId, error: error.message });
  for (const p of data ?? []) out.set(p.id, { slug: p.slug, title: p.title });
  return out;
}
