import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { loadInvoice } from "@/features/checkout/orders";
import { formatMoney } from "@/lib/money";
import { formatAddress, readAddress } from "@/features/storefront/store-profile";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

export default async function InvoicePage({ params, searchParams }: PageProps<"/store/[host]/orders/[id]/invoice">) {
  const { host, id } = await params;
  const sp = await searchParams;
  const { sf } = await getRenderContext(host);
  const inv = await loadInvoice(sf.tenant.tenantId, id, typeof sp.t === "string" ? sp.t : null);
  if (!inv) notFound();
  const b = inv.buyer.address;
  return (
    <div className="sf-container sf-section mx-auto max-w-3xl space-y-6 bg-white text-black print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tax invoice</h1>
          <p className="text-sm">
            {inv.number} · {new Date(inv.issuedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
          </p>
          <p className="text-sm">Order {inv.order.number}</p>
        </div>
        <PrintButton />
      </div>
      <div className="grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h2 className="font-medium">Sold by</h2>
          <p>{inv.seller.name}</p>
          <p>{formatAddress(readAddress(inv.seller.address)).join(", ")}</p>
          {inv.seller.gstin ? <p>GSTIN: {inv.seller.gstin}</p> : null}
        </div>
        {b ? (
          <div>
            <h2 className="font-medium">Ship to</h2>
            <p>{b.name}</p>
            <p>{[b.line1, b.line2, b.city, b.state, b.postal_code].filter(Boolean).join(", ")}</p>
            <p>{b.phone}</p>
          </div>
        ) : null}
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Item</th>
            <th className="py-2">HSN</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">GST</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">
                {l.title}
                {l.variant ? ` (${l.variant})` : ""}
              </td>
              <td className="py-2">{l.hsn ?? "—"}</td>
              <td className="py-2 text-right">{l.qty}</td>
              <td className="py-2 text-right">{formatMoney(l.unitPrice)}</td>
              <td className="py-2 text-right">
                {l.taxRate}% · {formatMoney(l.tax)}
              </td>
              <td className="py-2 text-right">{formatMoney(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(inv.totals.subtotal)}</dd></div>
        {inv.totals.discount ? <div className="flex justify-between"><dt>Discount</dt><dd>− {formatMoney(inv.totals.discount)}</dd></div> : null}
        <div className="flex justify-between"><dt>Shipping</dt><dd>{formatMoney(inv.totals.shipping)}</dd></div>
        {inv.totals.codFee ? <div className="flex justify-between"><dt>COD fee</dt><dd>{formatMoney(inv.totals.codFee)}</dd></div> : null}
        <div className="flex justify-between"><dt>GST{inv.totals.pricesIncludeTax ? " (included)" : ""}</dt><dd>{formatMoney(inv.totals.tax)}</dd></div>
        <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd>{formatMoney(inv.totals.grandTotal)}</dd></div>
      </dl>
    </div>
  );
}
