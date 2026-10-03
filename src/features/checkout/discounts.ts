import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import type { Tables } from "@/lib/supabase/database.types";
import type { DiscountDefinition } from "./pricing";

export const discountCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, "Enter a valid code");

const bxgyConfig = z.object({
  buy_quantity: z.coerce.number().int().min(1).max(100).catch(1).default(1),
  get_quantity: z.coerce.number().int().min(1).max(100).catch(1).default(1),
  get_percent: z.coerce.number().min(1).max(100).catch(100).default(100),
});

type DiscountRow = Pick<Tables<"discounts">, "id" | "code" | "title" | "type" | "value" | "applies_to" | "min_subtotal" | "max_discount" | "config">;

/** Pure: DB row (rupees) -> pricing definition (paise). */
export function toDiscountDefinition(row: DiscountRow, productIds: string[] = [], collectionIds: string[] = []): DiscountDefinition {
  const cfg = bxgyConfig.parse(row.config && typeof row.config === "object" ? row.config : {});
  const type = row.type as DiscountDefinition["type"];
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type,
    value: type === "fixed_amount" ? toMinor(row.value) : Number(row.value),
    appliesTo: row.applies_to as DiscountDefinition["appliesTo"],
    productIds,
    collectionIds,
    minSubtotal: toMinor(row.min_subtotal),
    maxDiscount: row.max_discount === null ? null : toMinor(row.max_discount),
    buyQuantity: cfg.buy_quantity,
    getQuantity: cfg.get_quantity,
    getPercent: cfg.get_percent,
  };
}

const COLUMNS = "id, code, title, type, value, applies_to, min_subtotal, max_discount, config, usage_limit, usage_count, starts_at, ends_at";

async function withTargets(tenantId: string, rows: (DiscountRow & { usage_limit: number | null; usage_count: number })[]): Promise<DiscountDefinition[]> {
  const usable = rows.filter((r) => r.usage_limit === null || r.usage_count < r.usage_limit);
  if (usable.length === 0) return [];
  const admin = createSupabaseAdminClient();
  const ids = usable.map((r) => r.id);
  const [products, collections] = await Promise.all([
    admin.from("discount_products").select("discount_id, product_id").eq("tenant_id", tenantId).in("discount_id", ids),
    admin.from("discount_collections").select("discount_id, collection_id").eq("tenant_id", tenantId).in("discount_id", ids),
  ]);
  return usable.map((r) =>
    toDiscountDefinition(
      r,
      (products.data ?? []).filter((p) => p.discount_id === r.id).map((p) => p.product_id),
      (collections.data ?? []).filter((c) => c.discount_id === r.id).map((c) => c.collection_id),
    ),
  );
}

/** Active, in-window, not exhausted discount for a code of THIS tenant. */
export async function findDiscountByCode(tenantId: string, code: string): Promise<DiscountDefinition | null> {
  const parsed = discountCode.safeParse(code);
  if (!parsed.success) return null;
  const now = new Date().toISOString();
  const { data } = await createSupabaseAdminClient()
    .from("discounts")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("code", parsed.data)
    .eq("status", "active")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt."${now}"`)
    .maybeSingle();
  if (!data) return null;
  return (await withTargets(tenantId, [data]))[0] ?? null;
}

export async function loadAutomaticDiscounts(tenantId: string): Promise<DiscountDefinition[]> {
  const now = new Date().toISOString();
  const { data } = await createSupabaseAdminClient()
    .from("discounts")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("automatic", true)
    .eq("status", "active")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt."${now}"`)
    .limit(20);
  return withTargets(tenantId, data ?? []);
}
