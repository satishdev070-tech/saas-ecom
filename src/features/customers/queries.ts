import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";

export const CUSTOMERS_PAGE_SIZE = 25;
export type CustomerFilters = { q?: string; tag?: string; marketing?: "yes" | "no"; page: number };

export function parseCustomerFilters(sp: Record<string, string | string[] | undefined>): CustomerFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined);
  const m = one("marketing");
  return { q: one("q")?.slice(0, 100) || undefined, tag: one("tag")?.slice(0, 40) || undefined, marketing: m === "yes" || m === "no" ? m : undefined, page: Math.max(1, Math.min(1000, Number(one("page")) || 1)) };
}

const clean = (q: string) => q.replace(/[%_,()\\]/g, " ").trim();

export async function listCustomers(tenantId: string, f: CustomerFilters, limit = CUSTOMERS_PAGE_SIZE, offset = (f.page - 1) * CUSTOMERS_PAGE_SIZE) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone, tags, accepts_marketing, status, orders_count, total_spent, last_order_at, created_at", { count: "exact" })
    .eq("tenant_id", tenantId);
  if (f.q) {
    const s = clean(f.q);
    if (s) q = q.or(`email.ilike.%${s}%,phone.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  }
  if (f.tag) q = q.contains("tags", [f.tag.toLowerCase()]);
  if (f.marketing) q = q.eq("accepts_marketing", f.marketing === "yes");
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw mapDbError(error);
  return { rows: (data ?? []).map((c) => ({ ...c, totalSpentMinor: toMinor(c.total_spent) })), total: count ?? 0 };
}

export async function getCustomer(tenantId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: c, error }, { data: addresses }, { data: orders }] = await Promise.all([
    supabase.from("customers").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    supabase.from("customer_addresses").select("id, label, name, phone, line1, line2, city, state, postal_code, is_default").eq("tenant_id", tenantId).eq("customer_id", id),
    supabase.from("orders").select("id, order_number, placed_at, status, fulfillment_status, grand_total").eq("tenant_id", tenantId).eq("customer_id", id).order("placed_at", { ascending: false }).limit(50),
  ]);
  if (error) throw mapDbError(error);
  if (!c) return null;
  return { customer: c, addresses: addresses ?? [], orders: (orders ?? []).map((o) => ({ ...o, totalMinor: toMinor(o.grand_total) })) };
}
