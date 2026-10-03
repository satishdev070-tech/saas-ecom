import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor } from "@/lib/money";
import { Badge, Card, PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { getCustomer } from "@/features/customers/queries";
import { customerDisplayName } from "@/features/customers/export";
import { formatDate } from "@/features/analytics/dates";
import { CustomerEditForm } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  const ctx = await requireTenantPermission("customers.read");
  const { id } = await params;
  const d = await getCustomer(ctx.tenantId, id);
  if (!d) notFound();
  const c = d.customer;
  return (
    <div className="space-y-6">
      <PageHeader title={customerDisplayName(c)} description={[c.email, c.phone].filter(Boolean).join(" · ")} back={<Link href="/dashboard/customers" className="text-muted hover:text-foreground">← Customers</Link>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Orders" value={c.orders_count} />
        <StatCard label="Lifetime value" value={formatMoney(toMinor(c.total_spent))} />
        <StatCard label="Customer since" value={formatDate(c.created_at)} hint={c.accepts_marketing ? "Subscribed to email" : "Not subscribed"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title="Orders">
          {d.orders.length ? (
            <Table caption="Customer orders">
              <thead>
                <tr><th className={th}>Order</th><th className={th}>Date</th><th className={th}>Status</th><th className={th}>Total</th></tr>
              </thead>
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td className={td}><Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">#{o.order_number}</Link></td>
                    <td className={td}>{formatDate(o.placed_at)}</td>
                    <td className={td}><Badge>{o.status === "cancelled" ? "Cancelled" : o.fulfillment_status}</Badge></td>
                    <td className={`${td} tabular-nums`}>{formatMoney(o.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted">No orders yet.</p>
          )}
        </Card>
        <div className="space-y-6">
          {can(ctx, "customers.write") ? (
            <Card title="Tags & notes">
              <CustomerEditForm id={c.id} tags={c.tags} note={c.note} status={c.status} />
            </Card>
          ) : null}
          <Card title="Addresses">
            {d.addresses.length ? (
              <ul className="space-y-3 text-sm">
                {d.addresses.map((a) => (
                  <li key={a.id}>
                    <p className="font-medium">{a.label || a.name}{a.is_default ? " (default)" : ""}</p>
                    <p className="text-muted">{[a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(", ")} · {a.phone}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No saved addresses.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
