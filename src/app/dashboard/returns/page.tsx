import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor } from "@/lib/money";
import { PageHeader, Table, td, th } from "@/components/ui/layout";
import { SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar } from "@/features/settings/ui/filter-bar";
import { listReturns } from "@/features/orders-admin/queries";
import { StatusBadge } from "@/features/orders-admin/components/status-badge";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Returns" };
const STATUSES = ["requested", "approved", "rejected", "received", "refunded", "closed"];

export default async function ReturnsPage({ searchParams }: PageProps<"/dashboard/returns">) {
  const ctx = await requireTenantPermission("orders.read");
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const { rows, total } = await listReturns(ctx, { status, page });
  return (
    <div>
      <PageHeader title="Returns" description="Return requests from customers. Approve, receive (restocks) and refund." />
      <FilterBar action="/dashboard/returns" resetHref="/dashboard/returns" label="Filter returns">
        <SelectField label="Status" name="status" defaultValue={status ?? ""} options={[{ value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))]} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No returns" description="Return requests appear here when customers ask to return delivered orders." />
      ) : (
        <>
          <Table caption="Returns">
            <thead>
              <tr>
                <th className={th}>Return</th>
                <th className={th}>Order</th>
                <th className={th}>Reason</th>
                <th className={th}>Status</th>
                <th className={th}>Refunded</th>
                <th className={th}>Requested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>
                    <Link href={`/dashboard/returns/${r.id}`} className="font-medium hover:underline">#{r.return_number}</Link>
                  </td>
                  <td className={td}>
                    <Link href={`/dashboard/orders/${r.order_id}`} className="hover:underline">#{r.orders.order_number}</Link>
                  </td>
                  <td className={td}>{r.reason}</td>
                  <td className={td}><StatusBadge status={r.status} /></td>
                  <td className={`${td} tabular-nums`}>{r.refund_amount ? formatMoney(toMinor(r.refund_amount)) : "—"}</td>
                  <td className={td}>{formatDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={25} total={total} basePath="/dashboard/returns" params={{ status }} />
        </>
      )}
    </div>
  );
}
