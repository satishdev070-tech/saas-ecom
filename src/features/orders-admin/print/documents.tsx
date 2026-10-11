/* eslint-disable @next/next/no-img-element -- print documents use plain <img> so they render without the optimizer */
import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney, toMinor } from "@/lib/money";
import { assetUrl } from "@/lib/storage/assets";
import { formatAddress, readAddress } from "@/features/storefront/store-profile";
import { addressLines, orderNumberLabel, statusLabel } from "../format";
import { code128Bars } from "./code128";
import type { PrintOrder } from "./load";

type Store = Tables<"stores">;

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const fmtDate = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v)) : "");

function Barcode({ value, height = 56 }: { value: string; height?: number }) {
  const code = code128Bars(value);
  if (!code) return null;
  return (
    <svg role="img" aria-label={`Barcode ${value}`} viewBox={`0 0 ${code.width} ${height}`} preserveAspectRatio="none" className="h-14 w-full">
      {code.bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}

function StoreMark({ store, size = "h-10" }: { store: Store; size?: string }) {
  const logo = assetUrl(store.logo_path);
  return logo ? <img src={logo} alt={store.name} className={`${size} w-auto max-w-[200px] object-contain`} /> : <p className="text-xl font-semibold">{store.name}</p>;
}

function storeAddressLines(store: Store): string[] {
  return formatAddress(readAddress(store.address));
}

/** Tax invoice (A4). The frozen invoice snapshot is the legal record, so it is printed as issued. */
export function InvoiceDoc({ store, p }: { store: Store; p: PrintOrder }) {
  const inv = p.invoice;
  if (!inv) {
    return (
      <section className="print-doc doc-a4 border border-dashed p-8 text-sm">
        <p className="font-semibold">Order {orderNumberLabel(p.order.order_number, store.order_prefix)}: no invoice yet.</p>
        <p className="mt-1">Issue the invoice from the order page (confirmed orders only), then print again.</p>
      </section>
    );
  }
  const b = inv.buyer.address;
  return (
    <section className="print-doc doc-a4 space-y-6 text-sm">
      <header className="flex items-start justify-between gap-6 border-b pb-4">
        <div className="space-y-1">
          <StoreMark store={store} />
          <p className="font-medium">{inv.seller.name ?? store.legal_name ?? store.name}</p>
          {formatAddress(readAddress(inv.seller.address)).map((l) => (
            <p key={l}>{l}</p>
          ))}
          {inv.seller.gstin ? <p>GSTIN: {inv.seller.gstin}</p> : null}
          {inv.seller.email || inv.seller.phone ? <p>{[inv.seller.email, inv.seller.phone].filter(Boolean).join(" · ")}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-semibold">Tax invoice</h1>
          <p>Invoice {inv.number}</p>
          <p>Date {fmtDate(inv.issuedAt)}</p>
          <p>Order {inv.order.number}</p>
          {inv.order.paymentMethod ? <p>Payment: {statusLabel(inv.order.paymentMethod)}</p> : null}
        </div>
      </header>
      {b ? (
        <div>
          <h2 className="font-medium">Bill / ship to</h2>
          <p>{b.name}</p>
          <p>{[b.line1, b.line2, b.city, b.state, b.postal_code].filter(Boolean).join(", ")}</p>
          <p>{[b.phone, inv.buyer.email].filter(Boolean).join(" · ")}</p>
        </div>
      ) : null}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2">HSN</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Rate</th>
            <th className="py-2 pr-2 text-right">GST</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-2 pr-2">
                {l.title}
                {l.variant ? ` (${l.variant})` : ""}
                {l.sku ? <span className="block text-xs text-neutral-600">SKU {l.sku}</span> : null}
              </td>
              <td className="py-2 pr-2">{l.hsn ?? "—"}</td>
              <td className="py-2 pr-2 text-right">{l.qty}</td>
              <td className="py-2 pr-2 text-right">{formatMoney(l.unitPrice)}</td>
              <td className="py-2 pr-2 text-right">
                {l.taxRate}% · {formatMoney(l.tax)}
              </td>
              <td className="py-2 text-right">{formatMoney(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-72 space-y-1">
        <Row label="Subtotal" value={formatMoney(inv.totals.subtotal)} />
        {inv.totals.discount ? <Row label="Discount" value={`− ${formatMoney(inv.totals.discount)}`} /> : null}
        <Row label="Shipping" value={inv.totals.shipping ? formatMoney(inv.totals.shipping) : "Free"} />
        {inv.totals.codFee ? <Row label="COD fee" value={formatMoney(inv.totals.codFee)} /> : null}
        <Row label={`GST${inv.totals.pricesIncludeTax ? " (included)" : ""}`} value={formatMoney(inv.totals.tax)} />
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(inv.totals.grandTotal)}</dd>
        </div>
      </dl>
      <p className="text-xs text-neutral-600">This is a computer-generated invoice and does not need a signature.</p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Packing slip (A5): what to put in the box, with tick boxes. No prices. */
export function PackingSlipDoc({ store, p }: { store: Store; p: PrintOrder }) {
  const o = p.order;
  return (
    <section className="print-doc doc-a5 space-y-4 text-sm">
      <header className="flex items-start justify-between gap-4 border-b pb-3">
        <StoreMark store={store} size="h-8" />
        <div className="text-right">
          <h1 className="text-lg font-semibold">Packing slip</h1>
          <p>Order {orderNumberLabel(o.order_number, store.order_prefix)}</p>
          <p>{fmtDate(o.placed_at)}</p>
        </div>
      </header>
      <div>
        <h2 className="font-medium">Ship to</h2>
        {addressLines(o.shipping_address).map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="w-8 py-2" aria-label="Packed" />
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2">SKU</th>
            <th className="py-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((it) => (
            <tr key={it.id} className="border-b align-top">
              <td className="py-2">
                <span className="inline-block size-4 border border-black" aria-hidden />
              </td>
              <td className="py-2 pr-2">
                {it.product_title}
                {it.variant_title ? ` · ${it.variant_title}` : ""}
              </td>
              <td className="py-2 pr-2">{it.sku ?? "—"}</td>
              <td className="py-2 text-right text-base font-semibold">{it.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Total items: <strong>{p.items.reduce((n, i) => n + i.quantity, 0)}</strong>
      </p>
      {o.note ? (
        <p className="rounded border p-2">
          <strong>Customer note:</strong> {o.note}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Shipping label (4×6 in, 100×150 mm: the size thermal label printers and couriers use). Paste
 * on the box. Shows the courier's AWB when a shipment is booked, else the order number barcode.
 */
export function ShippingLabelDoc({ store, p }: { store: Store; p: PrintOrder }) {
  const o = p.order;
  const number = orderNumberLabel(o.order_number, store.order_prefix);
  const cod = o.payment_method === "cod" && o.payment_status !== "paid";
  const awb = p.shipment?.tracking_number ?? null;
  const to = addressLines(o.shipping_address);
  const weight = p.shipment?.weight_grams ?? null;
  return (
    <section className="print-doc doc-label flex flex-col border-2 border-black text-[13px] leading-snug text-black">
      <div className="flex items-center justify-between border-b-2 border-black px-3 py-2">
        <StoreMark store={store} size="h-7" />
        <div className={`rounded px-2 py-1 text-base font-bold ${cod ? "bg-black text-white" : "border-2 border-black"}`}>{cod ? `COD ${formatMoney(toMinor(o.grand_total))}` : "PREPAID"}</div>
      </div>
      <div className="border-b-2 border-black px-3 py-2">
        <p className="text-[11px] font-semibold uppercase">Deliver to</p>
        {to.map((l, i) => (
          <p key={l} className={i === 0 ? "text-lg font-bold" : i === to.length - 2 ? "text-base font-bold" : ""}>
            {l}
          </p>
        ))}
      </div>
      <div className="border-b-2 border-black px-3 py-2">
        {p.shipment?.carrier ? <p className="text-sm font-semibold">{p.shipment.carrier}</p> : null}
        <Barcode value={awb ?? number} />
        <p className="text-center font-mono text-sm font-semibold">{awb ? `AWB ${awb}` : `Order ${number}`}</p>
      </div>
      <div className="grid grid-cols-2 border-b-2 border-black text-xs">
        <div className="border-r-2 border-black px-3 py-1.5">
          <p>Order {number}</p>
          <p>{fmtDate(o.placed_at)}</p>
        </div>
        <div className="px-3 py-1.5">
          <p>Items: {p.items.reduce((n, i) => n + i.quantity, 0)}</p>
          {weight ? <p>Weight: {(weight / 1000).toFixed(2)} kg</p> : <p>Value: {formatMoney(toMinor(o.grand_total))}</p>}
        </div>
      </div>
      <div className="mt-auto px-3 py-2 text-xs">
        <p className="font-semibold uppercase">If undelivered, return to</p>
        <p>{store.legal_name ?? store.name}</p>
        {storeAddressLines(store).map((l) => (
          <p key={l}>{l}</p>
        ))}
        {store.phone ? <p>{store.phone}</p> : null}
      </div>
    </section>
  );
}

/** Thank-you insert (A6): "welcome to the family" card with the items and the store's socials. */
export function ThankYouDoc({ store, p, message }: { store: Store; p: PrintOrder; message: string }) {
  const o = p.order;
  const name = (addressLines(o.shipping_address)[0] ?? "").split(" ")[0] || "there";
  const social = (store.social && typeof store.social === "object" && !Array.isArray(store.social) ? store.social : {}) as Record<string, unknown>;
  const handles = (["instagram", "facebook", "youtube", "pinterest", "x"] as const).flatMap((k) => (typeof social[k] === "string" && social[k] ? [{ k, v: String(social[k]) }] : []));
  return (
    <section className="print-doc doc-a6 flex flex-col items-center justify-between gap-3 border border-neutral-300 p-6 text-center text-sm">
      <StoreMark store={store} size="h-10" />
      <div className="space-y-2">
        <h1 className="font-serif text-2xl">Thank you, {name}!</h1>
        <p className="whitespace-pre-line">{message.replaceAll("{store}", store.name).replaceAll("{name}", name)}</p>
      </div>
      <div className="w-full border-y border-dashed py-2 text-left text-xs">
        <p className="mb-1 font-semibold">In your parcel</p>
        <ul className="space-y-0.5">
          {p.items.map((it) => (
            <li key={it.id}>
              {it.quantity} × {it.product_title}
              {it.variant_title ? ` (${it.variant_title})` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div className="text-xs">
        {handles.length ? <p>{handles.map((h) => h.v.replace(/^https?:\/\/(www\.)?/, "")).join(" · ")}</p> : null}
        {store.email || store.whatsapp || store.phone ? <p>Questions? {[store.whatsapp ? `WhatsApp ${store.whatsapp}` : store.phone, store.email].filter(Boolean).join(" · ")}</p> : null}
        <p className="mt-1">Order {orderNumberLabel(o.order_number, store.order_prefix)}</p>
      </div>
    </section>
  );
}

export const DEFAULT_THANK_YOU = "Welcome to the {store} family! Every piece was packed with care just for you. We'd love to see you wearing it, tag us on Instagram, and share your review.";
