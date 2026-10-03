import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import type { Json } from "@/lib/supabase/database.types";
import { groupByHandle, mergeImportIntoDraft, parseProductCsv, type RowError } from "../csv";
import { productInputSchema, toSaveProductPayload } from "../schemas";
import { comboKey } from "../variants";
import type { ProductDraft } from "../types";
import type { DbProduct } from "../draft";
import { countProducts, loadDrafts, PRODUCT_COLUMNS, productLimit } from "./products";
import { catalogDbError } from "./db-errors";

export const MAX_IMPORT_BYTES = 900_000;

export type ImportPlanItem = {
  handle: string;
  title: string;
  action: "create" | "update";
  variants: number;
  stockUpdates: number;
  rows: number[];
  errors: string[];
};

export type ImportPlan = {
  fatal?: string;
  items: ImportPlanItem[];
  rowErrors: RowError[];
  creates: number;
  updates: number;
  /** products that will be skipped because of errors */
  invalid: number;
  limit: number | null;
  current: number;
};

type PreparedItem = ImportPlanItem & { draft: ProductDraft; stock: { key: { sku: string | null; combo: string }; qty: number }[] };

/**
 * Parses and validates a product CSV against the tenant's current catalog. Nothing is
 * written. Row errors carry 1-based spreadsheet row numbers.
 */
async function prepare(tenantId: string, text: string): Promise<{ plan: ImportPlan; prepared: PreparedItem[] }> {
  const parsed = parseProductCsv(text);
  const empty: ImportPlan = { items: [], rowErrors: [], creates: 0, updates: 0, invalid: 0, limit: null, current: 0 };
  if (parsed.fatal) return { plan: { ...empty, fatal: parsed.fatal }, prepared: [] };

  const supabase = await createSupabaseServerClient();
  const groups = groupByHandle(parsed.rows);
  const handles = [...groups.keys()];
  const existing: DbProduct[] = [];
  for (let i = 0; i < handles.length; i += 200) {
    const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).eq("tenant_id", tenantId).in("slug", handles.slice(i, i + 200));
    if (error) throw mapDbError(error);
    existing.push(...((data ?? []) as DbProduct[]));
  }
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const drafts = await loadDrafts(supabase, tenantId, existing);
  const { data: cats, error: cErr } = await supabase.from("categories").select("id, slug").eq("tenant_id", tenantId);
  if (cErr) throw mapDbError(cErr);
  const catBySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));

  const prepared: PreparedItem[] = [];
  for (const [handle, rows] of groups) {
    const current = bySlug.get(handle);
    const merged = mergeImportIntoDraft(current ? drafts.get(current.id)! : null, rows, (slug) => catBySlug.get(slug) ?? null);
    const errors = merged.errors.flatMap((e) => e.messages.map((m) => `Row ${e.row}: ${m}`));
    // apply opening stock to NEW variants through save_product; existing ones use set_inventory later
    const draft = merged.draft;
    const stockLater: PreparedItem["stock"] = [];
    for (const s of merged.stock) {
      const v = draft.variants.find((x) => (s.key.sku && x.sku.toUpperCase() === s.key.sku.toUpperCase()) || comboKey(x) === s.key.combo);
      if (v && !v.id) v.initialStock = String(s.qty);
      else stockLater.push(s);
    }
    if (!errors.length) {
      const check = productInputSchema.safeParse(draft);
      if (!check.success) {
        errors.push(...check.error.issues.slice(0, 5).map((iss) => `${friendlyPath(iss.path)}${iss.message}`));
      }
    }
    prepared.push({
      handle,
      title: draft.title || handle,
      action: current ? "update" : "create",
      variants: draft.variants.length,
      stockUpdates: merged.stock.length,
      rows: rows.map((r) => r.rowNumber),
      errors,
      draft,
      stock: stockLater,
    });
  }

  const [limit, currentCount] = await Promise.all([productLimit(tenantId), countProducts(tenantId)]);
  const validCreates = prepared.filter((p) => p.action === "create" && !p.errors.length);
  if (limit !== null && currentCount + validCreates.length > limit) {
    const room = Math.max(0, limit - currentCount);
    validCreates.slice(room).forEach((p) => p.errors.push(`Your plan allows ${limit} products; this one would exceed it.`));
  }

  const items = prepared.map(({ draft: _d, stock: _s, ...rest }) => rest);
  return {
    prepared,
    plan: {
      items,
      rowErrors: parsed.errors,
      creates: items.filter((i) => i.action === "create" && !i.errors.length).length,
      updates: items.filter((i) => i.action === "update" && !i.errors.length).length,
      invalid: items.filter((i) => i.errors.length).length,
      limit,
      current: currentCount,
    },
  };
}

function friendlyPath(path: PropertyKey[]): string {
  if (!path.length) return "";
  if (path[0] === "variants" && typeof path[1] === "number") return `Variant ${path[1] + 1}${path[2] ? ` ${String(path[2])}` : ""}: `;
  return `${path.map(String).join(".")}: `;
}

export async function previewImport(tenantId: string, text: string): Promise<ImportPlan> {
  return (await prepare(tenantId, text)).plan;
}

export type ImportResult = {
  created: number;
  updated: number;
  stockSet: number;
  failed: { handle: string; message: string }[];
  skipped: number;
  rowErrors: RowError[];
  productIds: string[];
};

/**
 * Applies a CSV import. Every product is re-validated; products with errors are skipped.
 * Each product is saved atomically by public.save_product(); stock for existing variants is
 * then set with public.set_inventory() (needs inventory.write). Runs 4 products at a time.
 */
export async function applyImport(tenantId: string, text: string, opts: { canWriteInventory: boolean }): Promise<ImportResult> {
  const { plan, prepared } = await prepare(tenantId, text);
  if (plan.fatal) throw new AppError("VALIDATION", { fieldErrors: { file: [plan.fatal] } });
  const supabase = await createSupabaseServerClient();
  const valid = prepared.filter((p) => !p.errors.length);
  const result: ImportResult = { created: 0, updated: 0, stockSet: 0, failed: [], skipped: prepared.length - valid.length, rowErrors: plan.rowErrors, productIds: [] };

  const work = async (item: PreparedItem) => {
    try {
      const input = productInputSchema.parse(item.draft);
      const payload = toSaveProductPayload(input, { allowInitialStock: opts.canWriteInventory });
      const { data: id, error } = await supabase.rpc("save_product", { p_tenant: tenantId, p_payload: payload as unknown as Json });
      if (error) throw catalogDbError(error, { handle: item.handle });
      result.productIds.push(id);
      if (item.action === "create") result.created++;
      else result.updated++;
      if (opts.canWriteInventory && item.stock.length) {
        const { data: vs, error: vErr } = await supabase.from("product_variants").select("id, sku, option1, option2, option3").eq("tenant_id", tenantId).eq("product_id", id);
        if (vErr) throw mapDbError(vErr);
        for (const s of item.stock) {
          const v = (vs ?? []).find((x) => (s.key.sku && x.sku?.toUpperCase() === s.key.sku.toUpperCase()) || comboKey(x) === s.key.combo);
          if (!v) continue;
          const { error: sErr } = await supabase.rpc("set_inventory", { p_variant: v.id, p_available: s.qty, p_note: "CSV import" });
          if (sErr) throw mapDbError(sErr);
          result.stockSet++;
        }
      }
    } catch (err) {
      const message = err instanceof AppError ? (err.fieldErrors ? Object.values(err.fieldErrors).flat()[0] : undefined) ?? err.publicMessage : "Could not be saved";
      if (!(err instanceof AppError)) logger.error("catalog.import_item_failed", { tenantId, handle: item.handle, error: err });
      result.failed.push({ handle: item.handle, message });
    }
  };

  const queue = [...valid];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await work(item);
    }),
  );
  return result;
}
