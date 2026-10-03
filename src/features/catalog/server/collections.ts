import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { assetUrl } from "@/lib/storage/assets";
import { buildCollectionQuery, parseCollectionRules, type CollectionRules } from "../collection-rules";
import { catalogDbError } from "./db-errors";
import type { z } from "zod";
import type { collectionSchema } from "../schemas";

export type CollectionListRow = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  sortOrder: string;
  imageUrl: string | null;
  rules: CollectionRules;
  /** manual: member count; automated: matching active products */
  productCount: number;
  updatedAt: string;
};

export type CollectionDetail = {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: "manual" | "automated";
  status: "draft" | "active";
  sortOrder: string;
  imagePath: string | null;
  imageUrl: string | null;
  rules: CollectionRules;
  seoTitle: string;
  seoDescription: string;
  productIds: string[];
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Number of products (optionally active only) matching automated rules. */
export async function countRuleMatches(tenantId: string, rules: CollectionRules, activeOnly = true): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (activeOnly) q = q.eq("status", "active");
  const { count, error } = await buildCollectionQuery(q, rules);
  if (error) throw mapDbError(error);
  return count ?? 0;
}

/** Preview for the rules editor: total matches (any status) and the first few titles. */
export async function previewRules(tenantId: string, rules: CollectionRules): Promise<{ total: number; active: number; sample: { id: string; title: string; status: string }[] }> {
  const supabase = await createSupabaseServerClient();
  const q = supabase.from("products").select("id, title, status", { count: "exact" }).eq("tenant_id", tenantId).neq("status", "archived");
  const { data, count, error } = await buildCollectionQuery(q, rules).order("updated_at", { ascending: false }).limit(8);
  if (error) throw mapDbError(error);
  const active = await countRuleMatches(tenantId, rules);
  return { total: count ?? 0, active, sample: data ?? [] };
}

export async function listCollections(tenantId: string): Promise<CollectionListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, title, slug, type, status, sort_order, image_path, rules, updated_at, position")
    .eq("tenant_id", tenantId)
    .order("position")
    .order("title")
    .limit(500);
  if (error) throw mapDbError(error);
  const rows = data ?? [];
  const manualIds = rows.filter((r) => r.type === "manual").map((r) => r.id);
  const counts = new Map<string, number>();
  if (manualIds.length) {
    const { data: members, error: mErr } = await supabase.from("collection_products").select("collection_id").eq("tenant_id", tenantId).in("collection_id", manualIds).limit(50000);
    if (mErr) throw mapDbError(mErr);
    for (const m of members ?? []) counts.set(m.collection_id, (counts.get(m.collection_id) ?? 0) + 1);
  }
  const automated = rows.filter((r) => r.type === "automated");
  const autoCounts = await Promise.all(automated.map((r) => countRuleMatches(tenantId, parseCollectionRules(r.rules)).catch(() => 0)));
  automated.forEach((r, i) => counts.set(r.id, autoCounts[i]!));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    type: r.type,
    status: r.status,
    sortOrder: r.sort_order,
    imageUrl: assetUrl(r.image_path),
    rules: parseCollectionRules(r.rules),
    productCount: counts.get(r.id) ?? 0,
    updatedAt: r.updated_at,
  }));
}

/** Manual collections only (the product editor's membership checkboxes). */
export async function listManualCollections(tenantId: string): Promise<{ id: string; title: string; status: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("collections").select("id, title, status").eq("tenant_id", tenantId).eq("type", "manual").order("position").order("title").limit(500);
  if (error) throw mapDbError(error);
  return data ?? [];
}

/** All collections (id/title/type) for filters. */
export async function listCollectionOptions(tenantId: string): Promise<{ id: string; title: string; type: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("collections").select("id, title, type").eq("tenant_id", tenantId).order("title").limit(500);
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function getCollection(tenantId: string, id: string): Promise<CollectionDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: c, error } = await supabase
    .from("collections")
    .select("id, title, slug, description, type, status, sort_order, image_path, rules, seo")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapDbError(error);
  if (!c) return null;
  const { data: members, error: mErr } = await supabase
    .from("collection_products")
    .select("product_id, position")
    .eq("tenant_id", tenantId)
    .eq("collection_id", id)
    .order("position")
    .limit(1000);
  if (mErr) throw mapDbError(mErr);
  const seo = obj(c.seo);
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description ?? "",
    type: c.type === "automated" ? "automated" : "manual",
    status: c.status === "draft" ? "draft" : "active",
    sortOrder: c.sort_order,
    imagePath: c.image_path,
    imageUrl: assetUrl(c.image_path),
    rules: parseCollectionRules(c.rules),
    seoTitle: s(seo.title),
    seoDescription: s(seo.description),
    productIds: (members ?? []).map((m) => m.product_id),
  };
}

export type CollectionInput = z.infer<typeof collectionSchema>;

/**
 * Creates/updates a collection. Manual collections get their ordered product list replaced
 * atomically by public.set_collection_products(); automated ones store rules only.
 */
export async function saveCollection(tenantId: string, input: CollectionInput, imagePath: string | null | undefined): Promise<{ id: string; oldImagePath: string | null; created: boolean }> {
  const supabase = await createSupabaseServerClient();
  let old: { id: string; image_path: string | null } | null = null;
  if (input.id) {
    const { data, error } = await supabase.from("collections").select("id, image_path").eq("tenant_id", tenantId).eq("id", input.id).maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw new AppError("NOT_FOUND");
    old = data;
  }
  const seo: Record<string, string> = {};
  if (input.seoTitle) seo.title = input.seoTitle;
  if (input.seoDescription) seo.description = input.seoDescription;
  const row = {
    title: input.title,
    slug: input.slug,
    description: input.description,
    type: input.type,
    status: input.status,
    sort_order: input.type === "automated" && input.sortOrder === "manual" ? "newest" : input.sortOrder,
    rules: input.type === "automated" ? input.rules : { match: "all", conditions: [] },
    seo,
    ...(imagePath !== undefined ? { image_path: imagePath } : {}),
  };
  let id: string;
  if (old) {
    const { error } = await supabase.from("collections").update(row).eq("tenant_id", tenantId).eq("id", old.id);
    if (error) throw catalogDbError(error);
    id = old.id;
  } else {
    const { data, error } = await supabase.from("collections").insert({ ...row, tenant_id: tenantId }).select("id").single();
    if (error) throw catalogDbError(error);
    id = data.id;
  }
  if (input.type === "manual" || old) {
    // Manual: replace ordered list. Switching to automated clears stale manual rows.
    const ids = input.type === "manual" ? input.productIds : [];
    const { error } = await supabase.rpc("set_collection_products", { p_collection: id, p_product_ids: ids });
    if (error) {
      if (/unknown or duplicate/.test(error.message)) throw new AppError("VALIDATION", { fieldErrors: { productIds: ["Some selected products no longer exist. Reload and try again."] } });
      throw mapDbError(error);
    }
  }
  return { id, oldImagePath: imagePath !== undefined && old ? old.image_path : null, created: !old };
}

export async function deleteCollection(tenantId: string, id: string): Promise<{ title: string; imagePath: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("collections").delete().eq("tenant_id", tenantId).eq("id", id).select("title, image_path");
  if (error) throw mapDbError(error);
  const row = data?.[0];
  if (!row) throw new AppError("NOT_FOUND");
  return { title: row.title, imagePath: row.image_path };
}
