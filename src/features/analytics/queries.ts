import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";
import type { DateRange } from "./dates";

/** Sales/traffic report for a date range (IST day buckets computed in SQL). */
export async function getAnalyticsReport(tenantId: string, range: DateRange) {
  const supabase = await createSupabaseServerClient();
  const args = { p_tenant: tenantId, p_from: range.fromIso, p_to: range.toIsoExclusive };
  const [daily, top, funnel, pages] = await Promise.all([
    supabase.rpc("dashboard_sales_daily", args),
    supabase.rpc("dashboard_top_products", { ...args, p_limit: 10 }),
    supabase.rpc("dashboard_funnel", args),
    supabase.rpc("dashboard_top_pages", { ...args, p_limit: 15 }),
  ]);
  for (const r of [daily, top, funnel, pages]) if (r.error) throw mapDbError(r.error);
  const days = (daily.data ?? []).map((d) => ({ day: d.day, orders: d.orders, revenueMinor: toMinor(d.revenue) }));
  const revenue = days.reduce((s, d) => s + d.revenueMinor, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  return {
    days,
    totals: { revenueMinor: revenue, orders, aovMinor: orders ? Math.round(revenue / orders) : 0 },
    topProducts: (top.data ?? []).map((p) => ({ ...p, revenueMinor: toMinor(p.revenue) })),
    funnel: funnel.data ?? [],
    pages: pages.data ?? [],
  };
}
