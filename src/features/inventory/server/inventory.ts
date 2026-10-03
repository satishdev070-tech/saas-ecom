import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { INVENTORY_PAGE_SIZE, MOVEMENT_PAGE_SIZE } from "@/features/catalog/constants";
import { cleanSearch, likeEscape } from "@/features/catalog/format";
import { pgrstQuote } from "@/features/catalog/collection-rules";
import type { InventoryListQuery } from "../schemas";

/**
 * Seller inventory. Reads use public.inventory_overview() (RLS-scoped, SECURITY INVOKER).
 * Every stock change goes through public.adjust_inventory() / public.set_inventory(), which
 * lock the level row, refuse negative stock and write an inventory_movements row in the
 * same transaction (ADR-014). Never update inventory_levels directly.
 */

export type InventoryRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  productStatus: string;
  variantTitle: string;
  sku: string | null;
  variantStatus: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  available: number;
  reserved: number;
  threshold: number;
  lowStock: boolean;
  outOfStock: boolean;
};

type OverviewRow = {
  variant_id: string;
  product_id: string;
  product_title: string;
  product_status: string;
  variant_title: string;
  sku: string | null;
  variant_status: string;
  track_inventory: boolean;
  allow_backorder: boolean;
  available: number;
  reserved: number;
  low_stock_threshold: number;
  low_stock: boolean;
  out_of_stock: boolean;
};

const toRow = (r: OverviewRow): InventoryRow => ({
  variantId: r.variant_id,
  productId: r.product_id,
  productTitle: r.product_title,
  productStatus: r.product_status,
  variantTitle: r.variant_title,
  sku: r.sku,
  variantStatus: r.variant_status,
  trackInventory: r.track_inventory,
  allowBackorder: r.allow_backorder,
  available: r.available,
  reserved: r.reserved,
  threshold: r.low_stock_threshold,
  lowStock: r.low_stock,
  outOfStock: r.out_of_stock,
});

type OverviewFilterBuilder<Q> = {
  eq(column: string, value: string | boolean): Q;
  neq(column: string, value: string): Q;
  or(filters: string): Q;
};

function applyFilters<Q extends OverviewFilterBuilder<Q>>(q: Q, f: Pick<InventoryListQuery, "q" | "stock" | "archived">): Q {
  let out = q;
  if (!f.archived) out = out.eq("variant_status", "active").neq("product_status", "archived");
  if (f.stock === "low") out = out.eq("low_stock", true);
  if (f.stock === "out") out = out.eq("out_of_stock", true);
  if (f.stock === "untracked") out = out.eq("track_inventory", false);
  const search = cleanSearch(f.q);
  if (search) {
    const pat = pgrstQuote(`%${likeEscape(search)}%`);
    out = out.or(`product_title.ilike.${pat},sku.ilike.${pat},variant_title.ilike.${pat}`);
  }
  return out;
}

const SORTS: Record<InventoryListQuery["sort"], [string, boolean][]> = {
  product: [["product_title", true], ["position", true]],
  available_asc: [["available", true], ["product_title", true]],
  available_desc: [["available", false], ["product_title", true]],
  sku: [["sku", true]],
};

export async function listInventory(tenantId: string, f: InventoryListQuery, pageSize = INVENTORY_PAGE_SIZE): Promise<{ rows: InventoryRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  let q = applyFilters(supabase.rpc("inventory_overview", { p_tenant: tenantId }, { count: "exact" }).select("*"), f);
  for (const [col, asc] of SORTS[f.sort]) q = q.order(col, { ascending: asc, nullsFirst: false });
  const from = (f.page - 1) * pageSize;
  const { data, error, count } = await q.order("variant_id").range(from, from + pageSize - 1);
  if (error) throw mapDbError(error, { op: "listInventory" });
  return { rows: ((data ?? []) as OverviewRow[]).map(toRow), total: count ?? 0 };
}

/** Counts for the summary cards (active variants of non-archived products). */
export async function inventorySummary(tenantId: string): Promise<{ tracked: number; low: number; out: number }> {
  const supabase = await createSupabaseServerClient();
  const base = () => applyFilters(supabase.rpc("inventory_overview", { p_tenant: tenantId }, { count: "exact", head: true }).select("*"), { stock: "all", archived: false });
  const [tracked, low, out] = await Promise.all([base().eq("track_inventory", true), base().eq("low_stock", true), base().eq("out_of_stock", true)]);
  for (const r of [tracked, low, out]) if (r.error) throw mapDbError(r.error);
  return { tracked: tracked.count ?? 0, low: low.count ?? 0, out: out.count ?? 0 };
}

export async function getInventoryItem(tenantId: string, variantId: string): Promise<InventoryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("inventory_overview", { p_tenant: tenantId }).select("*").eq("variant_id", variantId).maybeSingle();
  if (error) throw mapDbError(error);
  return data ? toRow(data as OverviewRow) : null;
}

export type Movement = {
  id: number;
  delta: number;
  availableAfter: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listMovements(tenantId: string, variantId: string, page: number, pageSize = MOVEMENT_PAGE_SIZE): Promise<{ rows: Movement[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("inventory_movements")
    .select("id, delta, available_after, reason, reference_type, reference_id, note, created_by, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw mapDbError(error);
  const userIds = [...new Set((data ?? []).map((m) => m.created_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (userIds.length) {
    // co-members' profiles are readable (profiles_select policy); unknown ids just show no name
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
    for (const p of profiles ?? []) if (p.display_name) names.set(p.id, p.display_name);
  }
  return {
    total: count ?? 0,
    rows: (data ?? []).map((m) => ({
      id: m.id,
      delta: m.delta,
      availableAfter: m.available_after,
      reason: m.reason,
      referenceType: m.reference_type,
      referenceId: m.reference_id,
      note: m.note,
      createdBy: m.created_by,
      createdByName: m.created_by ? (names.get(m.created_by) ?? null) : null,
      createdAt: m.created_at,
    })),
  };
}

/** Confirms the variant belongs to this tenant (the RPCs re-check permission on its own tenant). */
async function assertVariant(tenantId: string, variantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("product_variants").select("id, product_id, title, sku").eq("tenant_id", tenantId).eq("id", variantId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return { supabase, variant: data };
}

function stockError(error: { code?: string; message?: string; hint?: string }) {
  if (error.hint === "INSUFFICIENT_STOCK") {
    return new AppError("CONFLICT", { fieldErrors: { quantity: ["That would take stock below zero. Use a smaller quantity or set the count instead."] } });
  }
  if (error.code === "22023") return new AppError("VALIDATION", { fieldErrors: { quantity: ["Enter a valid quantity."] } });
  return mapDbError(error);
}

export async function adjustStock(tenantId: string, input: { variantId: string; delta: number; reason: string; note: string | null }) {
  const { supabase, variant } = await assertVariant(tenantId, input.variantId);
  const { data, error } = await supabase.rpc("adjust_inventory", {
    p_variant: input.variantId,
    p_delta: input.delta,
    p_reason: input.reason,
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw stockError(error);
  return { available: data, variant };
}

export async function setStock(tenantId: string, input: { variantId: string; available: number; note: string | null }) {
  const { supabase, variant } = await assertVariant(tenantId, input.variantId);
  const { data, error } = await supabase.rpc("set_inventory", {
    p_variant: input.variantId,
    p_available: input.available,
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw stockError(error);
  return { available: data, variant };
}

/** Variant low-stock override (null = store default). Written as the user: RLS requires catalog.write. */
export async function setLowStockThreshold(tenantId: string, variantId: string, threshold: number | null) {
  const { supabase, variant } = await assertVariant(tenantId, variantId);
  const { error } = await supabase.from("product_variants").update({ low_stock_threshold: threshold }).eq("tenant_id", tenantId).eq("id", variantId);
  if (error) throw mapDbError(error);
  return { variant };
}

export async function storeLowStockDefault(tenantId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("stores").select("low_stock_default").eq("tenant_id", tenantId).maybeSingle();
  return data?.low_stock_default ?? 5;
}
