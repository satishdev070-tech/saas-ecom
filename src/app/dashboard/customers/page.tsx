import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney } from "@/lib/money";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { SelectField, TextField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar, queryString } from "@/features/settings/ui/filter-bar";
import { CUSTOMERS_PAGE_SIZE, listCustomers, parseCustomerFilters } from "@/features/customers/queries";
import { customerDisplayName } from "@/features/customers/export";
import { formatDate } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const ctx = await requireTenantPermission("customers.read");
  const f = parseCustomerFilters(await searchParams);
  const { rows, total } = await listCustomers(ctx.tenantId, f);
  const params = { q: f.q, tag: f.tag, marketing: f.marketing };
  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${total} customers`}
        actions={<a href={`/dashboard/customers/export${queryString(params)}`} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium" download>Export CSV</a>}
      />
      <FilterBar action="/dashboard/customers" resetHref="/dashboard/customers" label="Filter customers">
        <TextField label="Search" name="q" type="search" defaultValue={f.q ?? ""} placeholder="Name, email or phone" className="sm:col-span-2" />
        <TextField label="Tag" name="tag" defaultValue={f.tag ?? ""} />
        <SelectField label="Email marketing" name="marketing" defaultValue={f.marketing ?? ""} options={[{ value: "", label: "Any" }, { value: "yes", label: "Subscribed" }, { value: "no", label: "Not subscribed" }]} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No customers yet" description="Customers are added when they place an order, sign up or subscribe." />
      ) : (
        <>
          <Table caption="Customers">
            <thead>
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Orders</th>
                <th className={th}>Spent</th>
                <th className={th}>Last order</th>
                <th className={th}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={td}>
                    <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:underline">{customerDisplayName(c)}</Link>
                    <span className="block text-xs text-muted">{c.email ?? c.phone}</span>
                  </td>
                  <td className={`${td} tabular-nums`}>{c.orders_count}</td>
                  <td className={`${td} tabular-nums`}>{formatMoney(c.totalSpentMinor)}</td>
                  <td className={td}>{c.last_order_at ? formatDate(c.last_order_at) : "—"}</td>
                  <td className={td}>
                    <span className="flex flex-wrap gap-1">
                      {c.status === "blocked" ? <Badge tone="error">Blocked</Badge> : null}
                      {c.accepts_marketing ? <Badge tone="success">Subscribed</Badge> : null}
                      {c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={CUSTOMERS_PAGE_SIZE} total={total} basePath="/dashboard/customers" params={params} />
        </>
      )}
    </div>
  );
}
