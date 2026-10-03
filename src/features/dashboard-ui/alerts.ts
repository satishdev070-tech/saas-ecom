import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can, type TenantContext } from "@/lib/tenant/membership";

export type DashboardAlert = { key: string; label: string; count: number; href: string };

/**
 * Real, actionable counts for the topbar bell (only what the member may see). Two head-only
 * count queries; never throws (the shell must render).
 */
export const getDashboardAlerts = cache(async (ctx: TenantContext): Promise<DashboardAlert[]> => {
  if (!can(ctx, "orders.read")) return [];
  try {
    const supabase = await createSupabaseServerClient();
    const [toFulfil, returns] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "packed"]),
      supabase.from("returns").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "requested"),
    ]);
    return [
      { key: "fulfil", label: "orders waiting to be fulfilled", count: toFulfil.count ?? 0, href: "/dashboard/orders?fulfillment=unfulfilled" },
      { key: "returns", label: "return requests to review", count: returns.count ?? 0, href: "/dashboard/returns?status=requested" },
    ].filter((a) => a.count > 0);
  } catch {
    return [];
  }
});
