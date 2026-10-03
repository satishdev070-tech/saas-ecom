import { unstable_rethrow } from "next/navigation";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { listCustomers, parseCustomerFilters } from "@/features/customers/queries";
import { CUSTOMER_CSV_HEADER, customerCsvRows } from "@/features/customers/export";
import { buildCsv } from "@/features/analytics/csv";
import { toPublicError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const ctx = await requireTenant();
    assertPermission(ctx, "customers.read");
    const url = new URL(request.url);
    const f = parseCustomerFilters(Object.fromEntries(url.searchParams));
    const { rows } = await listCustomers(ctx.tenantId, f, 10000, 0);
    const mode = url.searchParams.get("mode") === "marketing" ? "marketing" : "all";
    const csv = buildCsv(CUSTOMER_CSV_HEADER[mode], customerCsvRows(rows as never, mode));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (err) {
    unstable_rethrow(err);
    return Response.json(toPublicError(err), { status: 403 });
  }
}
