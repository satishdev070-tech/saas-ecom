import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor } from "@/lib/money";
import { PageHeader, Table, td, th } from "@/components/ui/layout";
import { SelectField, TextField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar, queryString } from "@/features/settings/ui/filter-bar";
import { getStoreProfile } from "@/features/settings/queries";
import { ORDERS_PAGE_SIZE, queryOrders } from "@/features/orders-admin/queries";
import { parseOrderFilters } from "@/features/orders-admin/schemas";
import { FULFILLMENT_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, orderNumberLabel, statusLabel } from "@/features/orders-admin/format";
import { StatusBadge } from "@/features/orders-admin/components/status-badge";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Orders" };

const any = (label: string) => ({ value: "", label });
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: statusLabel(v) }));

export default async function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const ctx = await requireTenantPermission("orders.read");
  const f = parseOrderFilters(await searchParams);
  const [{ rows, total }, store] = await Promise.all([
    queryOrders(ctx, f, { offset: (f.page - 1) * ORDERS_PAGE_SIZE, limit: ORDERS_PAGE_SIZE }),
    getStoreProfile(ctx.tenantId),
  ]);
  const params = { q: f.q, status: f.status, payment: f.payment, fulfillment: f.fulfillment, method: f.method, from: f.from, to: f.to };
  const filtered = Object.values(params).some(Boolean);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order placed on your store. Filter, search and export."
        actions={
          total > 0 ? (
            <a href={`/dashboard/orders/export${queryString(params)}`} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-background" download>
              Export CSV
            </a>
          ) : null
        }
      />

      <FilterBar action="/dashboard/orders" resetHref="/dashboard/orders" label="Filter orders">
        <TextField label="Search" name="q" type="search" defaultValue={f.q ?? ""} placeholder="Order #, phone or email" className="sm:col-span-2" maxLength={100} />
        <SelectField label="Status" name="status" defaultValue={f.status ?? ""} options={[any("Any status"), ...opts(ORDER_STATUSES)]} />
        <SelectField label="Payment" name="payment" defaultValue={f.payment ?? ""} options={[any("Any payment"), ...opts(PAYMENT_STATUSES)]} />
        <SelectField label="Fulfilment" name="fulfillment" defaultValue={f.fulfillment ?? ""} options={[any("Any fulfilment"), ...opts(FULFILLMENT_STATUSES)]} />
        <SelectField label="Method" name="method" defaultValue={f.method ?? ""} options={[any("Any method"), ...opts(PAYMENT_METHODS)]} />
        <TextField label="From" name="from" type="date" defaultValue={f.from ?? ""} />
        <TextField label="To" name="to" type="date" defaultValue={f.to ?? ""} />
      </FilterBar>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No orders match these filters"
            description="Try a different search or clear the filters."
            action={
              <Link href="/dashboard/orders" className="text-sm font-medium text-accent underline">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState title="No orders yet" description="When customers check out, their orders appear here. Share your store link to get your first sale." />
        )
      ) : (
        <>
          <Table caption="Orders">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Order
                </th>
                <th scope="col" className={th}>
                  Placed
                </th>
                <th scope="col" className={th}>
                  Customer
                </th>
                <th scope="col" className={th}>
                  Payment
                </th>
                <th scope="col" className={th}>
                  Fulfilment
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const addr = (o.shipping_address ?? {}) as Record<string, unknown>;
                const name = typeof addr.name === "string" ? addr.name : null;
                return (
                  <tr key={o.id} className="hover:bg-background">
                    <td className={td}>
                      <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-accent hover:underline">
                        {orderNumberLabel(o.order_number, store.order_prefix)}
                      </Link>
                      {o.status === "cancelled" ? (
                        <span className="ml-2">
                          <StatusBadge status="cancelled" />
                        </span>
                      ) : null}
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{formatDateTime(o.placed_at)}</td>
                    <td className={td}>
                      <p className="max-w-[14rem] truncate">{name ?? o.email ?? o.phone}</p>
                      {name ? <p className="max-w-[14rem] truncate text-xs text-muted">{o.email ?? o.phone}</p> : null}
                    </td>
                    <td className={td}>
                      <StatusBadge status={o.payment_status} />
                      <p className="mt-1 text-xs text-muted">{statusLabel(o.payment_method)}</p>
                    </td>
                    <td className={td}>
                      <StatusBadge status={o.fulfillment_status} />
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{formatMoney(toMinor(o.grand_total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={ORDERS_PAGE_SIZE} total={total} basePath="/dashboard/orders" params={params} />
        </>
      )}
    </div>
  );
}
