import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { loadOrderView } from "@/features/checkout/orders";
import { paymentPath } from "@/features/checkout/order-access";
import { formatMoney } from "@/lib/money";
import { StoreImage } from "@/features/storefront/components/store-image";
import { TrackEvent } from "@/features/tracking/components/track-event";
import { CancelOrderForm, ReturnRequestForm } from "@/features/customer-account/components/forms";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const STATUS: Record<string, string> = {
  pending: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  unfulfilled: "Preparing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  rto: "Returned to sender",
};

export default async function OrderPage({ params, searchParams }: PageProps<"/store/[host]/orders/[id]">) {
  const { host, id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const { sf } = await getRenderContext(host);
  const order = await loadOrderView(sf.tenant.tenantId, id, token);
  if (!order) notFound();
  const justPlaced = sp.placed === "1";
  const addr = order.shippingAddress;
  const tokenQs = `?t=${encodeURIComponent(order.accessToken)}`;
  return (
    <div className="sf-container sf-section mx-auto max-w-4xl space-y-8">
      {!order.awaitingPayment && order.status !== "cancelled" && order.status !== "pending" ? (
        <TrackEvent
          name="purchase"
          onceKey={`purchase_${order.id}`}
          params={{
            transaction_id: String(order.number),
            value: order.grandTotal / 100,
            shipping: order.shippingTotal / 100,
            tax: order.taxTotal / 100,
            ...(order.discountCode ? { coupon: order.discountCode } : {}),
            items: order.items.map((i) => ({ item_id: i.sku || i.id, item_name: i.title, ...(i.variantTitle ? { item_variant: i.variantTitle } : {}), price: i.unitPrice / 100, quantity: i.quantity })),
          }}
        />
      ) : null}
      <header className="space-y-2">
        {justPlaced || order.status === "confirmed" ? <p className="sf-eyebrow">Thank you</p> : null}
        <h1 className="sf-heading text-4xl">Order {order.number}</h1>
        <p className="sf-muted text-sm">
          Placed {new Date(order.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {STATUS[order.status] ?? order.status}
          {order.status !== "cancelled" && order.status !== "pending" ? ` · ${STATUS[order.fulfillmentStatus] ?? order.fulfillmentStatus}` : ""}
        </p>
        {order.awaitingPayment ? (
          <p>
            <Link href={paymentPath(order.id)} className="sf-btn">
              Complete payment
            </Link>
          </p>
        ) : null}
        {order.cancelReason ? <p className="text-sm">Cancelled: {order.cancelReason}</p> : null}
      </header>

      <div className="grid gap-8 @[48rem]:grid-cols-[1fr_300px]">
        <section aria-labelledby="items-h" className="space-y-4">
          <h2 id="items-h" className="sf-heading text-2xl">
            Items
          </h2>
          <ul className="sf-border divide-y divide-[var(--sf-border)] border-y">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-4">
                <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded">
                  <StoreImage path={i.imagePath} alt="" sizes="64px" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{i.title}</p>
                  {i.variantTitle ? <p className="sf-muted">{i.variantTitle}</p> : null}
                  <p className="sf-muted">
                    Qty {i.quantity}
                    {i.returnedQuantity ? ` · ${i.returnedQuantity} returned` : ""}
                  </p>
                </div>
                <p className="text-sm tabular-nums">{formatMoney(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
            {order.discountTotal ? <div className="flex justify-between"><dt>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt><dd>− {formatMoney(order.discountTotal)}</dd></div> : null}
            <div className="flex justify-between"><dt>Shipping</dt><dd>{order.shippingTotal ? formatMoney(order.shippingTotal) : "Free"}</dd></div>
            {order.codFee ? <div className="flex justify-between"><dt>COD fee</dt><dd>{formatMoney(order.codFee)}</dd></div> : null}
            {!order.pricesIncludeTax ? <div className="flex justify-between"><dt>GST</dt><dd>{formatMoney(order.taxTotal)}</dd></div> : null}
            <div className="sf-border flex justify-between border-t pt-2 text-base font-medium"><dt>Total</dt><dd>{formatMoney(order.grandTotal)}</dd></div>
            {order.refundedTotal ? <div className="flex justify-between"><dt>Refunded</dt><dd>{formatMoney(order.refundedTotal)}</dd></div> : null}
          </dl>
        </section>

        <aside className="space-y-6 text-sm">
          {addr ? (
            <section>
              <h2 className="mb-2 font-medium">Delivery address</h2>
              <address className="sf-muted not-italic">
                {addr.name}
                <br />
                {[addr.line1, addr.line2, addr.landmark].filter(Boolean).join(", ")}
                <br />
                {addr.city}, {addr.state} {addr.postal_code}
                <br />
                {addr.phone}
              </address>
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 font-medium">Payment</h2>
            <p className="sf-muted">{order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"} · {order.paymentStatus.replace(/_/g, " ")}</p>
          </section>
          {order.shipments.length ? (
            <section>
              <h2 className="mb-2 font-medium">Tracking</h2>
              <ul className="space-y-1">
                {order.shipments.map((s) => (
                  <li key={s.id}>
                    {s.carrier ?? "Courier"} {s.trackingNumber ? `· ${s.trackingNumber}` : ""}{" "}
                    {s.trackingUrl ? (
                      <a href={s.trackingUrl} rel="noopener noreferrer" target="_blank" className="sf-link">
                        Track
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {order.hasInvoice ? (
            <Link href={`/orders/${order.id}/invoice${tokenQs}`} className="sf-link">
              View invoice
            </Link>
          ) : null}
          {order.viewerIsOwner && (order.status === "confirmed" || order.status === "pending") && order.fulfillmentStatus === "unfulfilled" ? <CancelOrderForm orderId={order.id} /> : null}
          {order.viewerIsOwner && order.fulfillmentStatus === "delivered" ? (
            <ReturnRequestForm orderId={order.id} items={order.items.map((i) => ({ id: i.id, title: i.title, variantTitle: i.variantTitle, returnable: i.quantity - i.returnedQuantity }))} />
          ) : null}
        </aside>
      </div>

      {order.events.length ? (
        <section aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="sf-heading mb-4 text-2xl">
            Updates
          </h2>
          <ol className="sf-border space-y-3 border-l pl-4 text-sm">
            {order.events.map((e) => (
              <li key={e.id}>
                <p>{e.message ?? e.type.replace(/_/g, " ")}</p>
                <p className="sf-muted text-xs">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {order.returns.length ? (
        <section>
          <h2 className="sf-heading mb-3 text-2xl">Returns</h2>
          <ul className="space-y-2 text-sm">
            {order.returns.map((r) => (
              <li key={r.id}>
                Return #{r.number} · {r.status} · {r.reason}
                {r.refundAmount ? ` · refunded ${formatMoney(r.refundAmount)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
