import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";

export async function listDiscounts(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient())
    .from("discounts")
    .select("id, code, title, type, value, min_subtotal, max_discount, config, automatic, starts_at, ends_at, usage_limit, usage_count, status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function getDiscount(tenantId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: d, error }, { data: prods }, { data: cols }] = await Promise.all([
    supabase.from("discounts").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    supabase.from("discount_products").select("product_id").eq("discount_id", id),
    supabase.from("discount_collections").select("collection_id").eq("discount_id", id),
  ]);
  if (error) throw mapDbError(error);
  return d ? { discount: d, productIds: (prods ?? []).map((p) => p.product_id), collectionIds: (cols ?? []).map((c) => c.collection_id) } : null;
}
