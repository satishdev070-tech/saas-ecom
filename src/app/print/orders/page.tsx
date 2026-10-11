import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { uuid } from "@/lib/validation/common";
import { PrintButton } from "@/components/ui/print-button";
import { loadPrintOrders, parseDocs, PRINT_DOCS, MAX_PRINT_ORDERS, type PrintDoc } from "@/features/orders-admin/print/load";
import { DEFAULT_THANK_YOU, InvoiceDoc, PackingSlipDoc, ShippingLabelDoc, ThankYouDoc } from "@/features/orders-admin/print/documents";
import { parseThankYouNote } from "@/features/checkout/options";

export const metadata: Metadata = { title: "Print orders" };

const DOC_LABEL: Record<PrintDoc, string> = { invoice: "Tax invoice (A4)", slip: "Packing slip (A5)", label: "Shipping label (4×6 in)", thanks: "Thank-you card (A6)" };

/**
 * Printable documents for one or more orders of the active store:
 * /print/orders?ids=<uuid>,<uuid>&docs=invoice,slip,label,thanks
 */
export default async function PrintOrdersPage({ searchParams }: PageProps<"/print/orders">) {
  const sp = await searchParams;
  // ?ids=a,b (links) or ?ids=a&ids=b (the orders list's checkbox form).
  const rawIds = Array.isArray(sp.ids) ? sp.ids : typeof sp.ids === "string" ? [sp.ids] : [];
  const ids = [...new Set(rawIds.flatMap((v) => v.split(",")).map((s) => s.trim()).filter((s) => uuid.safeParse(s).success))];
  if (ids.length === 0) {
    return (
      <main className="mx-auto max-w-md p-10 text-center text-sm">
        <p>Select at least one order to print.</p>
        <Link href="/dashboard/orders" className="mt-3 inline-block underline">
          Back to orders
        </Link>
      </main>
    );
  }
  const ctx = await requireTenantPermission("orders.read");
  const docs = parseDocs(sp.docs);
  const { store, orders } = await loadPrintOrders(ctx, ids);
  if (orders.length === 0) notFound();
  const message = parseThankYouNote(store.checkout_settings) ?? DEFAULT_THANK_YOU;
  const href = (d: PrintDoc[]) => `/print/orders?ids=${ids.join(",")}&docs=${d.join(",")}`;
  const back = orders.length === 1 ? `/dashboard/orders/${orders[0]!.order.id}` : "/dashboard/orders";

  return (
    <>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900">
        <Link href={back} className="text-neutral-600 hover:underline">
          ← Back
        </Link>
        <span className="font-medium">
          {orders.length === 1 ? "1 order" : `${orders.length} orders`}
          {ids.length > MAX_PRINT_ORDERS ? ` (first ${MAX_PRINT_ORDERS})` : ""}
        </span>
        <nav aria-label="Documents" className="flex flex-wrap gap-2">
          {PRINT_DOCS.map((d) => {
            const on = docs.includes(d);
            const next = on ? docs.filter((x) => x !== d) : PRINT_DOCS.filter((x) => docs.includes(x) || x === d);
            return (
              <Link key={d} href={href(next.length ? next : [d])} aria-pressed={on} className={`rounded-full border px-3 py-1 ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-100"}`}>
                {on ? "✓ " : ""}
                {DOC_LABEL[d]}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-neutral-500 sm:inline">Labels print at 4×6 in; set the label printer as the destination.</span>
          <PrintButton label="Print" />
        </div>
      </div>
      <main>
        {orders.map((p) => (
          <div key={p.order.id} className="contents">
            {docs.includes("invoice") ? <InvoiceDoc store={store} p={p} /> : null}
            {docs.includes("slip") ? <PackingSlipDoc store={store} p={p} /> : null}
            {docs.includes("label") ? <ShippingLabelDoc store={store} p={p} /> : null}
            {docs.includes("thanks") ? <ThankYouDoc store={store} p={p} message={message} /> : null}
          </div>
        ))}
      </main>
    </>
  );
}
