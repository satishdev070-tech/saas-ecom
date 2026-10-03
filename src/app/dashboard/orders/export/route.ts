import type { NextRequest } from "next/server";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { buildCsv, csvResponse } from "@/features/analytics/csv";
import { istDateKey } from "@/features/analytics/dates";
import { exportRoute } from "@/features/analytics/export-route";
import { getStoreProfile } from "@/features/settings/queries";
import { exportOrders } from "@/features/orders-admin/queries";
import { parseOrderFilters } from "@/features/orders-admin/schemas";
import { ORDER_CSV_HEADER, orderCsvRow } from "@/features/orders-admin/format";

/** CSV of orders matching the list filters (contains customer PII: audited + rate limited). */
export async function GET(req: NextRequest) {
  return exportRoute("orders", async () => {
    const ctx = await requireTenantPermission("orders.read");
    await rateLimit("export:orders", ctx.user.id, 20, 3600);
    const f = parseOrderFilters(Object.fromEntries(req.nextUrl.searchParams));
    const [{ rows, total, truncated }, store] = await Promise.all([exportOrders(ctx, f), getStoreProfile(ctx.tenantId)]);
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "orders.exported",
      entityType: "order",
      metadata: { rows: rows.length, total, truncated, filters: { status: f.status ?? null, payment: f.payment ?? null, fulfillment: f.fulfillment ?? null, from: f.from ?? null, to: f.to ?? null } },
    });
    const csv = buildCsv(ORDER_CSV_HEADER, rows.map((o) => orderCsvRow(o, store.order_prefix)));
    return csvResponse(`orders-${store.order_prefix === "#" ? "" : store.order_prefix}${istDateKey(new Date())}.csv`, csv);
  });
}
