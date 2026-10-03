import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { toMinor } from "@/lib/money";
import { can, type TenantContext } from "@/lib/tenant/membership";
import { addDays, istDateKey, istDayStart } from "./dates";
import { percentChange, zeroFillDays } from "./metrics";

export type HomeKpis = { revenueMinor: number; orders: number; aovMinor: number; revenueChange: number | null; ordersChange: number | null };
export type HomeOrder = { id: string; number: number; customer: string; placedAt: string; totalMinor: number; status: string; paymentStatus: string; fulfillmentStatus: string };
export type HomeLowStock = { variantId: string; productId: string; title: string; variant: string; sku: string | null; available: number; outOfStock: boolean };
export type SetupStep = { key: string; label: string; done: boolean; href: string };

export type DashboardHome = {
  sales: { kpis: HomeKpis; days: { day: string; orders: number; revenueMinor: number }[]; topProducts: { productId: string | null; title: string; units: number; revenueMinor: number }[] } | null;
  counts: { activeProducts: number; customers: number | null; toFulfil: number | null };
  recentOrders: HomeOrder[] | null;
  lowStock: { items: HomeLowStock[]; total: number } | null;
  setup: SetupStep[];
};

const DAYS = 30;

/**
 * Everything the dashboard home shows, read with the seller's own session (RLS applies).
 * Each panel is only loaded when the member's role grants the matching permission; otherwise
 * it is null and the page hides it. No figures are estimated or invented.
 */
export async function getDashboardHome(ctx: TenantContext, now = new Date()): Promise<DashboardHome> {
  const supabase = await createSupabaseServerClient();
  const t = ctx.tenantId;
  const todayKey = istDateKey(now);
  const fromKey = addDays(todayKey, -(DAYS - 1));
  const prevFromKey = addDays(fromKey, -DAYS);
  const range = { p_tenant: t, p_from: istDayStart(fromKey).toISOString(), p_to: istDayStart(addDays(todayKey, 1)).toISOString() };
  const prevRange = { p_tenant: t, p_from: istDayStart(prevFromKey).toISOString(), p_to: istDayStart(fromKey).toISOString() };

  const analytics = can(ctx, "analytics.read");
  const orders = can(ctx, "orders.read");
  const inventory = can(ctx, "inventory.read");
  const customers = can(ctx, "customers.read");

  const [daily, prevDaily, top, recent, toFulfil, stock, activeProducts, customerCount, media, theme, shipping, cod, payments] = await Promise.all([
    analytics ? supabase.rpc("dashboard_sales_daily", range) : null,
    analytics ? supabase.rpc("dashboard_sales_daily", prevRange) : null,
    analytics ? supabase.rpc("dashboard_top_products", { ...range, p_limit: 5 }) : null,
    orders
      ? supabase
          .from("orders")
          .select("id, order_number, email, customer_snapshot, grand_total, status, payment_status, fulfillment_status, placed_at")
          .eq("tenant_id", t)
          .neq("status", "pending")
          .order("placed_at", { ascending: false })
          .limit(6)
      : null,
    orders ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "packed"]) : null,
    inventory ? supabase.rpc("inventory_overview", { p_tenant: t }) : null,
    supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("status", "active"),
    customers ? supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", t) : null,
    supabase.from("product_media").select("id", { count: "exact", head: true }).eq("tenant_id", t),
    supabase.from("theme_versions").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("status", "published"),
    supabase.from("shipping_rates").select("id", { count: "exact", head: true }).eq("tenant_id", t),
    supabase.from("stores").select("cod_settings").eq("tenant_id", t).maybeSingle(),
    can(ctx, "payments.manage") ? supabase.from("tenant_payment_settings").select("enabled").eq("tenant_id", t).maybeSingle() : null,
  ]);
  for (const r of [daily, prevDaily, top, recent, toFulfil, stock, activeProducts, customerCount, media, theme, shipping]) if (r?.error) throw mapDbError(r.error);

  let sales: DashboardHome["sales"] = null;
  if (daily && prevDaily && top) {
    const days = zeroFillDays((daily.data ?? []).map((d) => ({ day: d.day, orders: d.orders, revenueMinor: toMinor(d.revenue) })), fromKey, todayKey);
    const revenueMinor = days.reduce((s, d) => s + d.revenueMinor, 0);
    const orderCount = days.reduce((s, d) => s + d.orders, 0);
    const prevRevenue = (prevDaily.data ?? []).reduce((s, d) => s + toMinor(d.revenue), 0);
    const prevOrders = (prevDaily.data ?? []).reduce((s, d) => s + d.orders, 0);
    sales = {
      kpis: {
        revenueMinor,
        orders: orderCount,
        aovMinor: orderCount ? Math.round(revenueMinor / orderCount) : 0,
        revenueChange: percentChange(prevRevenue, revenueMinor),
        ordersChange: percentChange(prevOrders, orderCount),
      },
      days,
      topProducts: (top.data ?? []).map((p) => ({ productId: p.product_id, title: p.title, units: p.units, revenueMinor: toMinor(p.revenue) })),
    };
  }

  const recentOrders: HomeOrder[] | null = recent
    ? (recent.data ?? []).map((o) => {
        const snap = (o.customer_snapshot ?? {}) as { first_name?: string; last_name?: string };
        const name = [snap.first_name, snap.last_name].filter(Boolean).join(" ");
        return { id: o.id, number: o.order_number, customer: name || o.email || "Guest", placedAt: o.placed_at, totalMinor: toMinor(o.grand_total), status: o.status, paymentStatus: o.payment_status, fulfillmentStatus: o.fulfillment_status };
      })
    : null;

  const flagged = (stock?.data ?? []).filter((v) => v.track_inventory && v.product_status === "active" && (v.out_of_stock || v.low_stock)).sort((a, b) => a.available - b.available);
  const lowStock = stock
    ? {
        total: flagged.length,
        items: flagged.slice(0, 6).map((v) => ({ variantId: v.variant_id, productId: v.product_id, title: v.product_title, variant: v.variant_title, sku: v.sku, available: v.available, outOfStock: v.out_of_stock })),
      }
    : null;

  const codEnabled = Boolean((cod.data?.cod_settings as { enabled?: boolean } | null)?.enabled);
  const setup: SetupStep[] = [
    { key: "product", label: "Add your first product", done: (activeProducts.count ?? 0) > 0, href: "/dashboard/products/new" },
    { key: "images", label: "Upload product photos", done: (media.count ?? 0) > 0, href: "/dashboard/products" },
    { key: "shipping", label: "Set shipping rates", done: (shipping.count ?? 0) > 0, href: "/dashboard/settings/shipping" },
    { key: "payments", label: "Turn on payments (online or cash on delivery)", done: codEnabled || Boolean(payments?.data?.enabled), href: "/dashboard/settings/payments" },
    { key: "theme", label: "Customise and publish your theme", done: (theme.count ?? 0) > 0, href: "/dashboard/theme" },
  ];

  return {
    sales,
    counts: { activeProducts: activeProducts.count ?? 0, customers: customerCount ? (customerCount.count ?? 0) : null, toFulfil: toFulfil ? (toFulfil.count ?? 0) : null },
    recentOrders,
    lowStock,
    setup,
  };
}
