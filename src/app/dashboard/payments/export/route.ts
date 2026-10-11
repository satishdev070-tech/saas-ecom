import type { NextRequest } from "next/server";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { buildCsv, csvResponse } from "@/features/analytics/csv";
import { istDateKey } from "@/features/analytics/dates";
import { exportRoute } from "@/features/analytics/export-route";
import { getStoreProfile } from "@/features/settings/queries";
import { orderNumberLabel } from "@/features/orders-admin/format";
import { exportTransactions } from "@/features/payments/transactions";
import { TXN_CSV_HEADER, parseTxnFilters, txnCsvRow } from "@/features/payments/transactions-format";

/** CSV of payment transactions matching the list filters (contains customer PII: audited + rate limited). */
export async function GET(req: NextRequest) {
  return exportRoute("payments", async () => {
    const ctx = await requireTenantPermission("orders.read");
    await rateLimit("export:payments", ctx.user.id, 20, 3600);
    const f = parseTxnFilters(Object.fromEntries(req.nextUrl.searchParams));
    const [{ rows, total, truncated }, store] = await Promise.all([exportTransactions(ctx, f), getStoreProfile(ctx.tenantId)]);
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "payments.exported",
      entityType: "payment",
      metadata: { rows: rows.length, total, truncated, filters: { provider: f.provider ?? null, status: f.status ?? null, from: f.from ?? null, to: f.to ?? null } },
    });
    const csv = buildCsv(TXN_CSV_HEADER, rows.map((r) => txnCsvRow(r, (n) => orderNumberLabel(n, store.order_prefix))));
    return csvResponse(`payments-${istDateKey(new Date())}.csv`, csv);
  });
}
