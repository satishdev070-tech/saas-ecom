import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { assetUrl } from "@/lib/storage/assets";
import { getTenantEntitlements } from "@/features/platform";
import { logger } from "@/lib/observability/logger";
import { PRODUCT_PAGE_SIZE } from "../constants";
import { dbToDraft, type DbOption, type DbOptionValue, type DbProduct, type DbVariant } from "../draft";
import { buildCollectionQuery, parseCollectionRules, pgrstQuote } from "../collection-rules";
import { descendantIds } from "../category-tree";
import { cleanSearch, dbMoneyToMinor, likeEscape } from "../format";
import type { ProductListQuery } from "../schemas";
import type { ProductDraft, ProductMedia } from "../types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const PRODUCT_COLUMNS =
  "id, updated_at, title, slug, description, short_description, product_type, brand, category_id, size_chart_id, status, featured, tags, attributes, care_instructions, shipping_info, return_info, hsn_code, seo";
const VARIANT_COLUMNS =
  "id, product_id, option1, option2, option3, sku, barcode, price, compare_at_price, cost_price, weight_grams, track_inventory, allow_backorder, low_stock_threshold, status, position";

export type ProductListRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  productType: string;
  categoryName: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  featured: boolean;
  variantCount: number;
  /** Sum of available stock over tracked, active variants; null when nothing is tracked. */
  stockTotal: number | null;
  thumbUrl: string | null;
  thumbAlt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ list */

/** Ids of products whose variant SKU matches the search (for "title or SKU" search). */
async function productIdsBySku(supabase: Supabase, tenantId: string, q: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("tenant_id", tenantId)
    .ilike("sku", `%${likeEscape(q)}%`)
    .limit(200);
  if (error) throw mapDbError(error);
  return [...new Set((data ?? []).map((r) => r.product_id))];
}

/** Applies the list filters (search, status, type, category incl. children, collection). */
async function applyProductFilters<Q extends ProductFilterBuilder<Q>>(supabase: Supabase, tenantId: string, query: Q, f: ProductListQuery): Promise<{ query: Q } | null> {
  let q = query.eq("tenant_id", tenantId);
  if (f.status) q = q.eq("status", f.status);
  if (f.type) q = q.eq("product_type", f.type);
  if (f.category) {
    const { data: cats, error } = await supabase.from("categories").select("id, parent_id, name, position").eq("tenant_id", tenantId);
    if (error) throw mapDbError(error);
    const rows = (cats ?? []).map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name, position: c.position }));
    q = q.in("category_id", [f.category, ...descendantIds(rows, f.category)]);
  }
  if (f.collection) {
    const { data: col, error } = await supabase.from("collections").select("id, type, rules").eq("tenant_id", tenantId).eq("id", f.collection).maybeSingle();
    if (error) throw mapDbError(error);
    if (!col) return null;
    if (col.type === "automated") q = buildCollectionQuery(q, parseCollectionRules(col.rules));
    else {
      const { data: members, error: mErr } = await supabase.from("collection_products").select("product_id").eq("tenant_id", tenantId).eq("collection_id", col.id).limit(1000);
      if (mErr) throw mapDbError(mErr);
      const ids = (members ?? []).map((m) => m.product_id);
      if (!ids.length) return null;
      q = q.in("id", ids);
    }
  }
  const search = cleanSearch(f.q);
  if (search) {
    const skuIds = await productIdsBySku(supabase, tenantId, search);
    const title = `title.ilike.${pgrstQuote(`%${likeEscape(search)}%`)}`;
    q = q.or(skuIds.length ? `${title},id.in.(${skuIds.join(",")})` : title);
  }
  // Wrapped: awaiting a bare query builder would execute it.
  return { query: q };
}

// Minimal structural type for the PostgREST builder methods used above.
type ProductFilterBuilder<Q> = {
  eq(column: string, value: string): Q;
  in(column: string, values: string[]): Q;
  or(filters: string): Q;
};

const SORTS: Record<ProductListQuery["sort"], { column: string; ascending: boolean }> = {
  updated_desc: { column: "updated_at", ascending: false },
  created_desc: { column: "created_at", ascending: false },
  title_asc: { column: "title", ascending: true },
  title_desc: { column: "title", ascending: false },
  price_asc: { column: "min_price", ascending: true },
  price_desc: { column: "min_price", ascending: false },
};

export async function listProducts(tenantId: string, f: ProductListQuery, pageSize = PRODUCT_PAGE_SIZE): Promise<{ rows: ProductListRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const base = supabase
    .from("products")
    .select("id, title, slug, status, product_type, featured, min_price, max_price, updated_at, categories(name)", { count: "exact" });
  const filtered = await applyProductFilters(supabase, tenantId, base, f);
  if (!filtered) return { rows: [], total: 0 };
  const sort = SORTS[f.sort];
  const from = (f.page - 1) * pageSize;
  const { data, count, error } = await filtered.query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("id")
    .range(from, from + pageSize - 1);
  if (error) throw mapDbError(error, { op: "listProducts" });
  const products = data ?? [];
  const ids = products.map((p) => p.id);
  const [thumbs, stock] = await Promise.all([thumbnails(supabase, tenantId, ids), stockTotals(supabase, tenantId, ids)]);
  return {
    total: count ?? 0,
    rows: products.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      productType: p.product_type,
      categoryName: p.categories?.name ?? null,
      minPrice: dbMoneyToMinor(p.min_price),
      maxPrice: dbMoneyToMinor(p.max_price),
      featured: p.featured,
      variantCount: stock.get(p.id)?.variants ?? 0,
      stockTotal: stock.get(p.id)?.tracked ? (stock.get(p.id)?.available ?? 0) : null,
      thumbUrl: thumbs.get(p.id)?.url ?? null,
      thumbAlt: thumbs.get(p.id)?.alt ?? p.title,
      updatedAt: p.updated_at,
    })),
  };
}

async function thumbnails(supabase: Supabase, tenantId: string, ids: string[]) {
  const out = new Map<string, { url: string | null; alt: string }>();
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from("product_media")
    .select("product_id, storage_path, alt_text, position")
    .eq("tenant_id", tenantId)
    .in("product_id", ids)
    .eq("media_type", "image")
    .order("position");
  if (error) throw mapDbError(error);
  for (const m of data ?? []) if (!out.has(m.product_id)) out.set(m.product_id, { url: assetUrl(m.storage_path), alt: m.alt_text ?? "" });
  return out;
}

async function stockTotals(supabase: Supabase, tenantId: string, ids: string[]) {
  const out = new Map<string, { variants: number; tracked: boolean; available: number }>();
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from("product_variants")
    .select("product_id, status, track_inventory, inventory_levels(available)")
    .eq("tenant_id", tenantId)
    .in("product_id", ids);
  if (error) throw mapDbError(error);
  for (const v of data ?? []) {
    const cur = out.get(v.product_id) ?? { variants: 0, tracked: false, available: 0 };
    if (v.status === "active") {
      cur.variants++;
      if (v.track_inventory) {
        cur.tracked = true;
        cur.available += (v.inventory_levels ?? []).reduce((s, l) => s + l.available, 0);
      }
    }
    out.set(v.product_id, cur);
  }
  return out;
}

/* ------------------------------------------------------------------ single product */

export type AdminProduct = {
  draft: ProductDraft;
  publishedAt: string | null;
  createdAt: string;
  media: ProductMedia[];
  collectionIds: string[];
  /** available stock per variant id (default location + others summed) */
  stock: Record<string, number>;
  hasOrders: boolean;
};

/**
 * Loads editor drafts for several products at once (batched; used by CSV import/export).
 * Returns a map keyed by product id.
 */
export async function loadDrafts(supabase: Supabase, tenantId: string, products: DbProduct[]): Promise<Map<string, ProductDraft>> {
  const out = new Map<string, ProductDraft>();
  for (let i = 0; i < products.length; i += 200) {
    const chunk = products.slice(i, i + 200);
    const ids = chunk.map((p) => p.id);
    const [opts, vars] = await Promise.all([
      supabase.from("product_options").select("id, product_id, position, name").eq("tenant_id", tenantId).in("product_id", ids),
      supabase.from("product_variants").select(VARIANT_COLUMNS).eq("tenant_id", tenantId).in("product_id", ids).order("position"),
    ]);
    if (opts.error) throw mapDbError(opts.error);
    if (vars.error) throw mapDbError(vars.error);
    const optionIds = (opts.data ?? []).map((o) => o.id);
    let values: DbOptionValue[] = [];
    if (optionIds.length) {
      const vals = await supabase.from("product_option_values").select("option_id, value, swatch, position").eq("tenant_id", tenantId).in("option_id", optionIds);
      if (vals.error) throw mapDbError(vals.error);
      values = vals.data ?? [];
    }
    for (const p of chunk) {
      const o = (opts.data ?? []).filter((x) => x.product_id === p.id) as DbOption[];
      const v = (vars.data ?? []).filter((x) => x.product_id === p.id) as DbVariant[];
      const oids = new Set(o.map((x) => x.id));
      out.set(p.id, dbToDraft(p, o, values.filter((x) => oids.has(x.option_id)), v));
    }
  }
  return out;
}

export async function getProductForAdmin(tenantId: string, id: string): Promise<AdminProduct | null> {
  const supabase = await createSupabaseServerClient();
  const { data: p, error } = await supabase.from("products").select(`${PRODUCT_COLUMNS}, published_at, created_at`).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  if (!p) return null;
  const [drafts, media, members, orders] = await Promise.all([
    loadDrafts(supabase, tenantId, [p]),
    supabase.from("product_media").select("id, storage_path, alt_text, variant_id, position").eq("tenant_id", tenantId).eq("product_id", id).order("position"),
    supabase.from("collection_products").select("collection_id").eq("tenant_id", tenantId).eq("product_id", id),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("product_id", id),
  ]);
  if (media.error) throw mapDbError(media.error);
  if (members.error) throw mapDbError(members.error);
  const draft = drafts.get(id)!;
  const variantIds = draft.variants.map((v) => v.id).filter((x): x is string => !!x);
  const stock: Record<string, number> = {};
  if (variantIds.length) {
    const { data: levels, error: lErr } = await supabase.from("inventory_levels").select("variant_id, available").eq("tenant_id", tenantId).in("variant_id", variantIds);
    if (lErr) throw mapDbError(lErr);
    for (const l of levels ?? []) stock[l.variant_id] = (stock[l.variant_id] ?? 0) + l.available;
  }
  return {
    draft,
    publishedAt: p.published_at,
    createdAt: p.created_at,
    media: (media.data ?? []).map((m) => ({ id: m.id, storagePath: m.storage_path, url: assetUrl(m.storage_path), altText: m.alt_text ?? "", variantId: m.variant_id, position: m.position })),
    collectionIds: (members.data ?? []).map((m) => m.collection_id),
    stock,
    // order_items may be unreadable without orders.read; treat errors as "unknown = has orders" for safety
    hasOrders: orders.error ? true : (orders.count ?? 0) > 0,
  };
}

/* ------------------------------------------------------------------ plan limits */

export async function countProducts(tenantId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (error) throw mapDbError(error);
  return count ?? 0;
}

/** Product limit from the tenant's plan (null = unlimited). Fails open (logged) if entitlements can't be read. */
export async function productLimit(tenantId: string): Promise<number | null> {
  try {
    const ent = await getTenantEntitlements(tenantId);
    return ent.limit("products");
  } catch (err) {
    logger.warn("catalog.entitlements_unavailable", { tenantId, error: err });
    return null;
  }
}

/** Throws a VALIDATION error when adding `adding` products would exceed the plan limit. */
export async function assertProductCapacity(tenantId: string, adding = 1): Promise<void> {
  const limit = await productLimit(tenantId);
  if (limit === null) return;
  const current = await countProducts(tenantId);
  if (current + adding > limit) {
    throw new AppError("VALIDATION", {
      fieldErrors: {
        _form: [
          adding === 1
            ? `Your plan allows ${limit} products and you have ${current}. Upgrade your plan or archive and delete products you no longer sell.`
            : `This would take you to ${current + adding} products; your plan allows ${limit}. Import fewer new products or upgrade your plan.`,
        ],
      },
      context: { tenantId, limit, current, adding },
    });
  }
}

/* ------------------------------------------------------------------ writes */

/** Current status + updated_at (for audit diffs); null when not in this tenant. */
export async function getProductStatus(tenantId: string, id: string): Promise<{ status: string; title: string; minPrice: number | null } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("status, title, min_price").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  return data ? { status: data.status, title: data.title, minPrice: dbMoneyToMinor(data.min_price) } : null;
}

/**
 * Replaces the product's MANUAL collection memberships. Adds first (appended at the end of
 * each collection), then removes, so a failure part-way never drops a product unexpectedly.
 */
export async function setProductCollections(tenantId: string, productId: string, collectionIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const wanted = [...new Set(collectionIds)];
  const { data: manual, error } = await supabase.from("collections").select("id").eq("tenant_id", tenantId).eq("type", "manual");
  if (error) throw mapDbError(error);
  const manualIds = new Set((manual ?? []).map((c) => c.id));
  if (wanted.some((id) => !manualIds.has(id))) throw new AppError("VALIDATION", { fieldErrors: { collectionIds: ["A selected collection no longer exists"] } });
  const { data: current, error: cErr } = await supabase.from("collection_products").select("collection_id").eq("tenant_id", tenantId).eq("product_id", productId);
  if (cErr) throw mapDbError(cErr);
  const have = new Set((current ?? []).map((c) => c.collection_id));
  const add = wanted.filter((id) => !have.has(id));
  const remove = [...have].filter((id) => manualIds.has(id) && !wanted.includes(id));
  if (add.length) {
    const { data: tails, error: tErr } = await supabase.from("collection_products").select("collection_id, position").eq("tenant_id", tenantId).in("collection_id", add);
    if (tErr) throw mapDbError(tErr);
    const max = new Map<string, number>();
    for (const t of tails ?? []) max.set(t.collection_id, Math.max(max.get(t.collection_id) ?? 0, t.position));
    const { error: iErr } = await supabase
      .from("collection_products")
      .upsert(add.map((cid) => ({ tenant_id: tenantId, collection_id: cid, product_id: productId, position: (max.get(cid) ?? 0) + 1 })), { onConflict: "collection_id,product_id", ignoreDuplicates: true });
    if (iErr) throw mapDbError(iErr);
  }
  if (remove.length) {
    const { error: dErr } = await supabase.from("collection_products").delete().eq("tenant_id", tenantId).eq("product_id", productId).in("collection_id", remove);
    if (dErr) throw mapDbError(dErr);
  }
}

export type BulkResult = { changed: string[]; skipped: { id: string; reason: string }[] };

/**
 * Status changes / deletes for up to 100 products of this tenant.
 * - publish skips products without an active, priced variant
 * - delete skips products that appear on orders (archive those instead)
 */
export async function bulkUpdateProducts(tenantId: string, op: "publish" | "unpublish" | "archive" | "delete", ids: string[]): Promise<BulkResult> {
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase.from("products").select("id, status, min_price").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw mapDbError(error);
  const found = rows ?? [];
  const skipped: BulkResult["skipped"] = ids.filter((id) => !found.some((r) => r.id === id)).map((id) => ({ id, reason: "not found" }));
  let eligible = found.map((r) => r.id);

  if (op === "publish") {
    const noVariant = found.filter((r) => r.min_price === null).map((r) => r.id);
    skipped.push(...noVariant.map((id) => ({ id, reason: "no active variant" })));
    eligible = eligible.filter((id) => !noVariant.includes(id));
  }
  if (op === "delete" && eligible.length) {
    const { data: sold, error: sErr } = await supabase.from("order_items").select("product_id").eq("tenant_id", tenantId).in("product_id", eligible).limit(1000);
    if (sErr) throw mapDbError(sErr);
    const soldIds = new Set((sold ?? []).map((s) => s.product_id));
    skipped.push(...[...soldIds].filter((x): x is string => !!x).map((id) => ({ id, reason: "has orders" })));
    eligible = eligible.filter((id) => !soldIds.has(id));
  }
  if (!eligible.length) return { changed: [], skipped };

  if (op === "delete") {
    const { error: dErr } = await supabase.from("products").delete().eq("tenant_id", tenantId).in("id", eligible);
    if (dErr) throw mapDbError(dErr);
  } else {
    const status = op === "publish" ? "active" : op === "unpublish" ? "draft" : "archived";
    const { error: uErr } = await supabase.from("products").update({ status }).eq("tenant_id", tenantId).in("id", eligible);
    if (uErr) throw mapDbError(uErr);
  }
  return { changed: eligible, skipped };
}

/** Deletes one product and its media files. Refuses products that appear on orders. */
export async function deleteProduct(tenantId: string, id: string): Promise<{ title: string; mediaPaths: string[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: p, error } = await supabase.from("products").select("id, title").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  if (!p) throw new AppError("NOT_FOUND");
  const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("product_id", id);
  if ((count ?? 0) > 0) {
    throw new AppError("CONFLICT", { fieldErrors: { _form: ["This product appears on orders, so it can't be deleted. Archive it instead to hide it from your store."] } });
  }
  const { data: media } = await supabase.from("product_media").select("storage_path").eq("tenant_id", tenantId).eq("product_id", id);
  const { error: dErr } = await supabase.from("products").delete().eq("tenant_id", tenantId).eq("id", id);
  if (dErr) throw mapDbError(dErr);
  return { title: p.title, mediaPaths: (media ?? []).map((m) => m.storage_path) };
}

/* ------------------------------------------------------------------ pickers / lookups */

export type ProductPick = { id: string; title: string; status: string; thumbUrl: string | null };

export async function searchProductsForPicker(tenantId: string, q: string | undefined, exclude: string[] = [], limit = 20): Promise<ProductPick[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("products").select("id, title, status").eq("tenant_id", tenantId).neq("status", "archived");
  const search = cleanSearch(q);
  if (search) query = query.ilike("title", `%${likeEscape(search)}%`);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit + Math.min(exclude.length, 100));
  if (error) throw mapDbError(error);
  const rows = (data ?? []).filter((r) => !exclude.includes(r.id)).slice(0, limit);
  const thumbs = await thumbnails(supabase, tenantId, rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, thumbUrl: thumbs.get(r.id)?.url ?? null }));
}

export async function getProductPicks(tenantId: string, ids: string[]): Promise<ProductPick[]> {
  if (!ids.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("id, title, status").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw mapDbError(error);
  const thumbs = await thumbnails(supabase, tenantId, ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, title: r.title, status: r.status, thumbUrl: thumbs.get(r.id)?.url ?? null }] : [];
  });
}

/* ------------------------------------------------------------------ export */

export const EXPORT_MAX_PRODUCTS = 5000;

/** Products matching the list filters (all pages, capped) as drafts + category slug + stock. */
export async function productsForExport(tenantId: string, f: ProductListQuery) {
  const supabase = await createSupabaseServerClient();
  const products: DbProduct[] = [];
  for (let from = 0; from < EXPORT_MAX_PRODUCTS; from += 1000) {
    const filtered = await applyProductFilters(supabase, tenantId, supabase.from("products").select(PRODUCT_COLUMNS), f);
    if (!filtered) break;
    const { data, error } = await filtered.query.order("created_at").order("id").range(from, Math.min(from + 999, EXPORT_MAX_PRODUCTS - 1));
    if (error) throw mapDbError(error);
    products.push(...((data ?? []) as DbProduct[]));
    if ((data ?? []).length < 1000) break;
  }
  const drafts = await loadDrafts(supabase, tenantId, products);
  const { data: cats, error: cErr } = await supabase.from("categories").select("id, slug").eq("tenant_id", tenantId);
  if (cErr) throw mapDbError(cErr);
  const catSlug = new Map((cats ?? []).map((c) => [c.id, c.slug]));
  const stock = new Map<string, number>();
  const variantIds = [...drafts.values()].flatMap((d) => d.variants.map((v) => v.id)).filter((x): x is string => !!x);
  for (let i = 0; i < variantIds.length; i += 300) {
    const { data, error } = await supabase.from("inventory_levels").select("variant_id, available").eq("tenant_id", tenantId).in("variant_id", variantIds.slice(i, i + 300));
    if (error) throw mapDbError(error);
    for (const l of data ?? []) stock.set(l.variant_id, (stock.get(l.variant_id) ?? 0) + l.available);
  }
  return products.map((p) => ({ draft: drafts.get(p.id)!, categorySlug: p.category_id ? (catSlug.get(p.category_id) ?? null) : null, stockByVariantId: stock }));
}

export { PRODUCT_COLUMNS, VARIANT_COLUMNS };
