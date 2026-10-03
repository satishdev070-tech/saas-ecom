import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney, toMinor, toDecimalString } from "@/lib/money";
import { assetUrl } from "@/lib/storage/assets";
import { Card, PageHeader } from "@/components/ui/layout";
import { uuid } from "@/lib/validation/common";
import { getStoreProfile } from "@/features/settings/queries";
import { getOrderDetail } from "@/features/orders-admin/queries";
import { addressLines, orderNumberLabel, refundableMinor, statusLabel } from "@/features/orders-admin/format";
import { nextFulfillmentActions } from "@/features/orders-admin/schemas";
import { formatDateTime } from "@/features/analytics/dates";
import { customerDisplayName } from "@/features/customers/export";
import { StatusBadge } from "@/features/orders-admin/components/status-badge";
import { getShippingSetup } from "@/features/shipping/service";
import { parseAttribution } from "@/features/tracking/items";
import { BookCourierButton, CourierShipmentActions } from "@/features/shipping/components/courier-actions";
import {
  CancelOrderButton,
  FulfillmentActions,
  IssueInvoiceButton,
  RefundButton,
  ResendEmailForm,
  StaffNoteForm,
  TimelineNoteForm,
} from "@/features/orders-admin/components/order-actions";

export const metadata: Metadata = { title: "Order" };

const linkBtn = "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-background";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: PageProps<"/dashboard/orders/[id]">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireTenantPermission("orders.read");
  const [d, store, shipping] = await Promise.all([getOrderDetail(ctx, id), getStoreProfile(ctx.tenantId), getShippingSetup(ctx.tenantId)]);
  const courier = shipping.provider.id;
  const { order: o } = d;
  const attribution = parseAttribution(JSON.stringify((o as { attribution?: unknown }).attribution ?? null));
  const canWrite = can(ctx, "orders.write");
  const canRefund = can(ctx, "orders.refund");
  const number = orderNumberLabel(o.order_number, store.order_prefix);
  const refundable = refundableMinor(o);
  const steps = nextFulfillmentActions(o);
  const cancellable = o.status !== "cancelled" && !["shipped", "delivered", "returned", "rto"].includes(o.fulfillment_status);
  const paid = ["paid", "partially_refunded"].includes(o.payment_status);
  const customerName = d.customer ? customerDisplayName(d.customer) : (addressLines(o.shipping_address)[0] ?? o.email ?? o.phone);
  const discountLabel = o.discount_code ? `Discount (${o.discount_code})` : "Discount";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${number}`}
        description={`Placed ${formatDateTime(o.placed_at)} · ${statusLabel(o.payment_method)}`}
        back={
          <Link href="/dashboard/orders" className="text-muted hover:text-foreground">
            ← Orders
          </Link>
        }
        actions={
          <>
            {d.invoice ? (
              <Link href={`/dashboard/orders/${o.id}/invoice`} className={linkBtn}>
                Invoice {d.invoice.invoice_number}
              </Link>
            ) : canWrite && o.status !== "pending" && o.status !== "cancelled" ? (
              <IssueInvoiceButton orderId={o.id} />
            ) : null}
            <Link href={`/dashboard/orders/${o.id}/packing-slip`} className={linkBtn}>
              Packing slip
            </Link>
            {canWrite && cancellable ? <CancelOrderButton orderId={o.id} paid={paid} /> : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-2" aria-label="Order status">
        <StatusBadge status={o.status} />
        <StatusBadge status={o.payment_status} />
        <StatusBadge status={o.fulfillment_status} />
      </div>

      {o.status === "cancelled" ? (
        <p role="note" className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm">
          Cancelled {formatDateTime(o.cancelled_at)}
          {o.cancel_reason ? ` — ${o.cancel_reason}` : ""}.{paid ? " The payment has not been fully refunded yet." : ""}
        </p>
      ) : o.status === "pending" ? (
        <p role="note" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Awaiting online payment. Unpaid orders are cancelled automatically when the reservation expires.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Items (${d.items.reduce((n, i) => n + i.quantity, 0)})`}>
            <ul className="divide-y divide-border">
              {d.items.map((i) => {
                const img = assetUrl(i.image_path);
                const options = Object.entries((i.options ?? {}) as Record<string, unknown>)
                  .filter(([, v]) => typeof v === "string" && v)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(" · ");
                return (
                  <li key={i.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="size-14 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                      {img ? <Image src={img} alt="" width={56} height={56} className="size-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {i.product_id ? (
                          <Link href={`/dashboard/products/${i.product_id}`} className="hover:underline">
                            {i.product_title}
                          </Link>
                        ) : (
                          i.product_title
                        )}
                      </p>
                      <p className="text-xs text-muted">{[options || i.variant_title, i.sku ? `SKU ${i.sku}` : null].filter(Boolean).join(" · ")}</p>
                      {i.returned_quantity > 0 ? <p className="text-xs text-warning">{i.returned_quantity} returned</p> : null}
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <p>
                        {formatMoney(toMinor(i.unit_price))} × {i.quantity}
                      </p>
                      {toMinor(i.discount_total) > 0 ? <p className="text-xs text-success">−{formatMoney(toMinor(i.discount_total))}</p> : null}
                      <p className="font-medium">{formatMoney(toMinor(i.line_total))}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 border-t border-border pt-3 text-sm">
              <Row label="Subtotal" value={formatMoney(toMinor(o.subtotal))} />
              {toMinor(o.discount_total) > 0 ? <Row label={discountLabel} value={`−${formatMoney(toMinor(o.discount_total))}`} /> : null}
              <Row label="Shipping" value={toMinor(o.shipping_total) > 0 ? formatMoney(toMinor(o.shipping_total)) : "Free"} />
              {toMinor(o.cod_fee) > 0 ? <Row label="COD fee" value={formatMoney(toMinor(o.cod_fee))} /> : null}
              <Row label={o.prices_include_tax ? "GST (included)" : "GST"} value={formatMoney(toMinor(o.tax_total))} />
              <Row label="Total" value={formatMoney(toMinor(o.grand_total))} strong />
              {toMinor(o.refunded_total) > 0 ? <Row label="Refunded" value={`−${formatMoney(toMinor(o.refunded_total))}`} /> : null}
            </dl>
          </Card>

          <Card title="Fulfilment" actions={<StatusBadge status={o.fulfillment_status} />}>
            {d.shipments.length ? (
              <ul className="mb-4 space-y-2 text-sm">
                {d.shipments.map((s) => (
                  <li key={s.id} className="rounded-md border border-border p-3">
                    <p className="font-medium">
                      {s.carrier ?? "Courier"} {s.tracking_number ? `· ${s.tracking_number}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {statusLabel(s.status)} · shipped {formatDateTime(s.shipped_at)}
                      {s.delivered_at ? ` · delivered ${formatDateTime(s.delivered_at)}` : ""}
                    </p>
                    {canWrite && (s.provider === "shiprocket" || s.provider === "delhivery") && s.status !== "cancelled" ? (
                      <CourierShipmentActions shipmentId={s.id} cancellable={s.status === "pending" || s.status === "packed"} />
                    ) : null}
                    {s.tracking_url && s.tracking_url.startsWith("https://") ? (
                      <a href={s.tracking_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-accent underline">
                        Track shipment ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mb-4 space-y-2">
                <p className="text-sm text-muted">Not shipped yet.</p>
                {canWrite && courier !== "manual" && o.status === "confirmed" && o.fulfillment_status === "unfulfilled" ? (
                  <BookCourierButton orderId={o.id} courier={courier === "delhivery" ? "Delhivery" : "Shiprocket"} />
                ) : null}
              </div>
            )}
            {canWrite ? (
              steps.length ? (
                <FulfillmentActions orderId={o.id} steps={steps} />
              ) : o.status === "pending" ? (
                <p className="text-sm text-muted">You can fulfil this order once payment is received.</p>
              ) : null
            ) : (
              <p className="text-sm text-muted">You have view-only access to orders.</p>
            )}
          </Card>

          <Card title="Payments & refunds">
            {d.payments.length === 0 && d.refunds.length === 0 ? (
              <p className="text-sm text-muted">{o.payment_method === "cod" ? "Cash on delivery: payment is recorded when the order is delivered." : "No payment captured yet."}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {p.provider === "cod" ? "Cash on delivery" : p.provider === "razorpay" ? "Razorpay" : "Manual"}
                      {p.method && p.method !== "cod" ? ` · ${p.method}` : ""}
                      {p.provider_payment_id ? <span className="ml-1 text-xs text-muted">{p.provider_payment_id}</span> : null}
                      <span className="ml-2">
                        <StatusBadge status={p.status === "captured" ? "paid" : p.status} />
                      </span>
                    </span>
                    <span className="tabular-nums">{formatMoney(toMinor(p.amount))}</span>
                  </li>
                ))}
                {d.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Refund ({r.method === "original" ? "to original method" : r.method}) · {formatDateTime(r.created_at)}
                      <span className="ml-2">
                        <StatusBadge status={r.status === "processed" ? "refunded" : r.status} />
                      </span>
                      {r.reason ? <span className="block text-xs text-muted">{r.reason}</span> : null}
                    </span>
                    <span className="tabular-nums">−{formatMoney(toMinor(r.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
            {canRefund && refundable > 0 ? (
              <div className="mt-4">
                <RefundButton orderId={o.id} maxRupees={toDecimalString(refundable)} />
              </div>
            ) : null}
          </Card>

          <Card title="Timeline">
            {canWrite ? (
              <div className="mb-5">
                <TimelineNoteForm orderId={o.id} />
              </div>
            ) : null}
            <ol className="space-y-3 border-l border-border pl-4 text-sm">
              {d.events.map((e) => {
                const data = (e.data ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id} className="relative">
                    <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border" />
                    <p className={e.type === "note" ? "whitespace-pre-line" : ""}>
                      {e.message ?? statusLabel(e.type)}
                      {typeof data.tracking === "string" ? ` · ${String(data.carrier ?? "")} ${data.tracking}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(e.created_at)}
                      {e.type === "note" ? " · internal comment" : e.visible_to_customer ? " · visible to customer" : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <p className="font-medium">
              {d.customer ? (
                <Link href={`/dashboard/customers/${d.customer.id}`} className="hover:underline">
                  {customerName}
                </Link>
              ) : (
                customerName
              )}
            </p>
            {d.customer ? <p className="text-xs text-muted">{d.customer.orders_count === 1 ? "First order" : `${d.customer.orders_count} orders`}</p> : <p className="text-xs text-muted">Guest checkout</p>}
            <dl className="mt-3 space-y-1 text-sm">
              {o.email ? (
                <div>
                  <dt className="sr-only">Email</dt>
                  <dd className="break-all">
                    <a href={`mailto:${o.email}`} className="hover:underline">
                      {o.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a href={`tel:${o.phone}`} className="hover:underline">
                    {o.phone}
                  </a>
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Shipping address">
            <address className="text-sm not-italic leading-6">
              {addressLines(o.shipping_address).map((l, i) => (
                <span key={i} className="block">
                  {l}
                </span>
              ))}
            </address>
          </Card>

          {o.billing_address ? (
            <Card title="Billing address">
              <address className="text-sm not-italic leading-6">
                {addressLines(o.billing_address).map((l, i) => (
                  <span key={i} className="block">
                    {l}
                  </span>
                ))}
              </address>
            </Card>
          ) : null}

          {attribution ? (
            <Card title="Marketing source">
              <dl className="space-y-1 text-sm">
                {(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const).map((k) =>
                  attribution[k] ? (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted">{k.replace("utm_", "").replace(/^./, (c) => c.toUpperCase())}</dt>
                      <dd className="truncate">{attribution[k]}</dd>
                    </div>
                  ) : null,
                )}
                {attribution.gclid ? <p className="text-xs text-muted">Google Ads click (gclid)</p> : null}
                {attribution.fbclid ? <p className="text-xs text-muted">Meta ads click (fbclid)</p> : null}
                {attribution.landing_path ? <p className="truncate text-xs text-muted">Landed on {attribution.landing_path}</p> : null}
              </dl>
            </Card>
          ) : null}

          {o.note ? (
            <Card title="Customer note">
              <p className="whitespace-pre-line text-sm">{o.note}</p>
            </Card>
          ) : null}

          <Card title="Staff note">
            {canWrite ? <StaffNoteForm orderId={o.id} note={o.staff_note} /> : <p className="whitespace-pre-line text-sm">{o.staff_note ?? "—"}</p>}
          </Card>

          {d.returns.length ? (
            <Card title="Returns">
              <ul className="space-y-2 text-sm">
                {d.returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/returns/${r.id}`} className="text-accent hover:underline">
                      Return #{r.return_number}
                    </Link>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {canWrite && o.email ? (
            <Card title="Customer emails">
              <ResendEmailForm orderId={o.id} />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
