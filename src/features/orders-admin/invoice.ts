import { toMinor } from "@/lib/money";

/**
 * Invoice view model (pure). `invoices.data` is a frozen JSON snapshot written by
 * app.issue_invoice(); money is numeric rupees there and becomes integer paise here.
 * GST split: intra-state supply (seller state = place of supply) → CGST + SGST halves;
 * inter-state → IGST. Place of supply = shipping address state.
 */

export type InvoiceLine = {
  title: string;
  variant: string | null;
  sku: string | null;
  hsn: string | null;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type InvoiceView = {
  seller: { name: string; gstin: string | null; addressLines: string[]; email: string | null; phone: string | null; state: string | null };
  buyer: { addressLines: string[]; email: string | null; phone: string | null; state: string | null };
  order: { number: string; placedAt: string | null; paymentMethod: string };
  totals: {
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    codFeeMinor: number;
    taxMinor: number;
    grandTotalMinor: number;
    pricesIncludeTax: boolean;
  };
  lines: InvoiceLine[];
  tax: { intraState: boolean; cgstMinor: number; sgstMinor: number; igstMinor: number };
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
function money(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return toMinor(v);
  if (typeof v === "string" && v.trim()) {
    try {
      return toMinor(v);
    } catch {
      return 0;
    }
  }
  return 0;
}
const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : Number.parseInt(String(v ?? 0), 10) || 0);

export function addressToLines(a: unknown): string[] {
  const x = obj(a);
  const cityLine = [str(x.city), str(x.state)].filter(Boolean).join(", ");
  return [str(x.name), str(x.line1), str(x.line2), str(x.landmark) ? `Near ${str(x.landmark)}` : null, [cityLine, str(x.postal_code)].filter(Boolean).join(" – ") || null, str(x.phone)].filter(
    (l): l is string => !!l,
  );
}

function normState(s: string | null): string | null {
  return s ? s.toLowerCase().replace(/[^a-z]/g, "") : null;
}

export function buildInvoiceView(data: unknown, orderPrefix = "#"): InvoiceView {
  const d = obj(data);
  const seller = obj(d.seller);
  const buyer = obj(d.buyer);
  const order = obj(d.order);
  const totals = obj(d.totals);
  const sellerAddress = obj(seller.address);
  const buyerAddress = obj(buyer.address);
  const lines: InvoiceLine[] = (Array.isArray(d.lines) ? d.lines : []).map((raw) => {
    const l = obj(raw);
    return {
      title: str(l.title) ?? "Item",
      variant: str(l.variant),
      sku: str(l.sku),
      hsn: str(l.hsn),
      qty: int(l.qty),
      unitPriceMinor: money(l.unit_price),
      discountMinor: money(l.discount),
      taxRate: Number(l.tax_rate ?? 0) || 0,
      taxMinor: money(l.tax),
      totalMinor: money(l.total),
    };
  });
  const sellerState = str(sellerAddress.state);
  const buyerState = str(buyerAddress.state);
  const taxMinor = money(totals.tax);
  const intraState = !!sellerState && !!buyerState && normState(sellerState) === normState(buyerState);
  const cgst = intraState ? Math.floor(taxMinor / 2) : 0;
  return {
    seller: {
      name: str(seller.name) ?? "Seller",
      gstin: str(seller.gstin),
      addressLines: addressToLines(sellerAddress),
      email: str(seller.email),
      phone: str(seller.phone),
      state: sellerState,
    },
    buyer: { addressLines: addressToLines(buyerAddress), email: str(buyer.email), phone: str(buyer.phone), state: buyerState },
    order: {
      number: `${orderPrefix}${str(String(order.number ?? "")) ?? ""}`,
      placedAt: str(order.placed_at),
      paymentMethod: order.payment_method === "cod" ? "Cash on delivery" : "Prepaid (online)",
    },
    totals: {
      subtotalMinor: money(totals.subtotal),
      discountMinor: money(totals.discount),
      shippingMinor: money(totals.shipping),
      codFeeMinor: money(totals.cod_fee),
      taxMinor,
      grandTotalMinor: money(totals.grand_total),
      pricesIncludeTax: totals.prices_include_tax !== false,
    },
    lines,
    tax: { intraState, cgstMinor: cgst, sgstMinor: intraState ? taxMinor - cgst : 0, igstMinor: intraState ? 0 : taxMinor },
  };
}
