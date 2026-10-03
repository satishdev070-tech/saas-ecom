import { toMinor } from "@/lib/money";
import { readOrderAddress, type OrderAddress } from "@/features/customer-account/address";

/** Pure invoice model (unit tested). The JSON is frozen by app.issue_invoice at confirmation. */

export function formatInvoiceOrderNumber(prefix: string, orderNumber: number | string): string {
  return `${prefix}${orderNumber}`;
}

export type InvoiceData = {
  number: string;
  issuedAt: string;
  seller: { name: string | null; gstin: string | null; address: Record<string, unknown>; email: string | null; phone: string | null };
  buyer: { address: OrderAddress | null; email: string | null; phone: string | null };
  order: { number: string; placedAt: string | null; paymentMethod: string | null };
  totals: { subtotal: number; discount: number; shipping: number; codFee: number; tax: number; grandTotal: number; pricesIncludeTax: boolean };
  lines: { title: string; variant: string | null; sku: string | null; hsn: string | null; qty: number; unitPrice: number; discount: number; taxRate: number; tax: number; total: number }[];
};

const money = (v: unknown): number => {
  if (typeof v === "number" || typeof v === "string") {
    try {
      return toMinor(v);
    } catch {
      return 0;
    }
  }
  return 0;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Pure: frozen invoice JSON (written by app.issue_invoice) -> display model. */
export function parseInvoiceData(invoiceNumber: string, issuedAt: string, orderPrefix: string, raw: unknown): InvoiceData {
  const d = obj(raw);
  const seller = obj(d.seller);
  const buyer = obj(d.buyer);
  const order = obj(d.order);
  const totals = obj(d.totals);
  const lines = Array.isArray(d.lines) ? d.lines : [];
  return {
    number: invoiceNumber,
    issuedAt,
    seller: { name: str(seller.name), gstin: str(seller.gstin), address: obj(seller.address), email: str(seller.email), phone: str(seller.phone) },
    buyer: { address: readOrderAddress(buyer.address), email: str(buyer.email), phone: str(buyer.phone) },
    order: { number: formatInvoiceOrderNumber(orderPrefix, str(order.number) ?? ""), placedAt: str(order.placed_at), paymentMethod: str(order.payment_method) },
    totals: {
      subtotal: money(totals.subtotal),
      discount: money(totals.discount),
      shipping: money(totals.shipping),
      codFee: money(totals.cod_fee),
      tax: money(totals.tax),
      grandTotal: money(totals.grand_total),
      pricesIncludeTax: totals.prices_include_tax !== false,
    },
    lines: lines.map((raw) => {
      const l = obj(raw);
      return {
        title: str(l.title) ?? "",
        variant: str(l.variant),
        sku: str(l.sku),
        hsn: str(l.hsn),
        qty: typeof l.qty === "number" ? l.qty : Number(l.qty ?? 0) || 0,
        unitPrice: money(l.unit_price),
        discount: money(l.discount),
        taxRate: typeof l.tax_rate === "number" ? l.tax_rate : Number(l.tax_rate ?? 0) || 0,
        tax: money(l.tax),
        total: money(l.total),
      };
    }),
  };
}

