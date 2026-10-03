import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui/layout";
import { getReturnDetail } from "@/features/orders-admin/queries";
import { nextReturnStatuses } from "@/features/orders-admin/schemas";
import { RefundButton, ReturnStatusActions } from "@/features/orders-admin/components/order-actions";
import { StatusBadge } from "@/features/orders-admin/components/status-badge";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Return" };

export default async function ReturnDetailPage({ params }: PageProps<"/dashboard/returns/[id]">) {
  const ctx = await requireTenantPermission("orders.read");
  const { id } = await params;
  const d = await getReturnDetail(ctx, id);
  if (!d?.ret || !d.order) notFound();
  const { ret, order } = d;
  const refundable = toMinor(order.grand_total) - toMinor(order.refunded_total);
  const itemValue = (d.items ?? []).reduce((s, i) => s + toMinor(i.order_items.unit_price) * i.quantity, 0);
  const suggested = Math.min(refundable, itemValue);
  const writable = can(ctx, "orders.write");
  return (
    <div className="space-y-6">
      <PageHeader title={`Return #${ret.return_number}`} description={`Order #${order.order_number} · ${formatDateTime(ret.created_at)}`} back={<Link href="/dashboard/returns" className="text-muted hover:text-foreground">← Returns</Link>} actions={<StatusBadge status={ret.status} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title="Items">
          <ul className="divide-y divide-border text-sm">
            {(d.items ?? []).map((i) => (
              <li key={i.order_item_id} className="flex justify-between gap-4 py-2">
                <span>
                  {i.order_items.product_title}
                  {i.order_items.variant_title ? ` · ${i.order_items.variant_title}` : ""} × {i.quantity}
                </span>
                <span className="tabular-nums">{formatMoney(toMinor(i.order_items.unit_price) * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm"><span className="text-muted">Reason:</span> {ret.reason}</p>
          {ret.customer_note ? <p className="mt-1 text-sm"><span className="text-muted">Customer note:</span> {ret.customer_note}</p> : null}
        </Card>
        <div className="space-y-6">
          <Card title="Actions">
            <div className="space-y-3">
              {writable ? <ReturnStatusActions returnId={ret.id} next={nextReturnStatuses(ret.status)} /> : null}
              {can(ctx, "orders.refund") && ["received", "approved"].includes(ret.status) && suggested > 0 ? (
                <RefundButton orderId={order.id} returnId={ret.id} maxRupees={(suggested / 100).toFixed(2)} label={`Refund ${formatMoney(suggested)}`} />
              ) : null}
              <p className="text-xs text-muted">Receiving a return restocks the items{ret.restock ? "" : " (restock disabled)"}.</p>
            </div>
          </Card>
          {(d.refunds ?? []).length ? (
            <Card title="Refunds">
              <ul className="space-y-1 text-sm">
                {(d.refunds ?? []).map((r) => (
                  <li key={r.id}>{formatMoney(toMinor(r.amount))} · {r.status} · {formatDateTime(r.created_at)}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
