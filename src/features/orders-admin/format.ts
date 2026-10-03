import { toMinor } from "@/lib/money";
import type { CsvValue } from "@/features/analytics/csv";

/** Display helpers for orders/returns (pure; safe in client and server components). */

export type Tone = "neutral" | "success" | "warning" | "error" | "accent";

export const ORDER_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
export const PAYMENT_STATUSES = ["pending", "cod_pending", "paid", "partially_refunded", "refunded", "failed", "expired"] as const;
export const FULFILLMENT_STATUSES = ["unfulfilled", "packed", "shipped", "delivered", "returned", "rto"] as const;
export const PAYMENT_METHODS = ["cod", "online"] as const;
export const RETURN_STATUSES = ["requested", "approved", "rejected", "received", "refunded", "closed"] as const;

const LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  cod_pending: "COD due",
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  failed: "Failed",
  expired: "Expired",
  unfulfilled: "Unfulfilled",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  rto: "RTO",
  cod: "Cash on delivery",
  online: "Online",
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  closed: "Closed",
};

export function statusLabel(s: string): string {
  return LABELS[s] ?? s.replace(/_/g, " ");
}

const TONES: Record<string, Tone> = {
  pending: "warning",
  confirmed: "accent",
  completed: "success",
  cancelled: "error",
  cod_pending: "warning",
  paid: "success",
  partially_refunded: "warning",
  refunded: "neutral",
  failed: "error",
  expired: "neutral",
  unfulfilled: "warning",
  packed: "accent",
  shipped: "accent",
  delivered: "success",
  returned: "neutral",
  rto: "error",
  requested: "warning",
  approved: "accent",
  rejected: "error",
  received: "accent",
  closed: "neutral",
};

export function statusTone(s: string): Tone {
  return TONES[s] ?? "neutral";
}

export function orderNumberLabel(n: number | string, prefix = "#"): string {
  return `${prefix}${n}`;
}

export type AddressJson = {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

/** Address JSON snapshot → display lines (unknown keys ignored; always strings). */
export function addressLines(a: unknown): string[] {
  if (!a || typeof a !== "object") return [];
  const x = a as Record<string, unknown>;
  const s = (k: string) => (typeof x[k] === "string" ? (x[k] as string).trim() : "");
  const cityLine = [s("city"), s("state")].filter(Boolean).join(", ");
  return [s("name"), s("line1"), s("line2"), s("landmark") ? `Near ${s("landmark")}` : "", [cityLine, s("postal_code")].filter(Boolean).join(" – "), s("phone")].filter(Boolean);
}

/** Amount still refundable, in paise. */
export function refundableMinor(o: { grand_total: number | string; refunded_total: number | string; payment_status: string }): number {
  if (!["paid", "partially_refunded"].includes(o.payment_status)) return 0;
  return Math.max(0, toMinor(o.grand_total) - toMinor(o.refunded_total));
}

export type OrderCsvRow = {
  order_number: number;
  placed_at: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  payment_method: string;
  email: string | null;
  phone: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  cod_fee: number;
  tax_total: number;
  grand_total: number;
  refunded_total: number;
  discount_code: string | null;
  shipping_address: unknown;
};

export const ORDER_CSV_HEADER = [
  "Order",
  "Placed at",
  "Status",
  "Payment status",
  "Fulfilment status",
  "Payment method",
  "Customer name",
  "Email",
  "Phone",
  "City",
  "State",
  "PIN code",
  "Subtotal",
  "Discount",
  "Shipping",
  "COD fee",
  "Tax",
  "Total",
  "Refunded",
  "Discount code",
] as const;

const rupeesCell = (v: number | string) => toMinor(v) / 100;

export function orderCsvRow(o: OrderCsvRow, prefix = "#"): CsvValue[] {
  const addr = (o.shipping_address ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof addr[k] === "string" ? (addr[k] as string) : "");
  return [
    orderNumberLabel(o.order_number, prefix),
    o.placed_at,
    o.status,
    o.payment_status,
    o.fulfillment_status,
    o.payment_method,
    str("name"),
    o.email,
    o.phone,
    str("city"),
    str("state"),
    str("postal_code"),
    rupeesCell(o.subtotal),
    rupeesCell(o.discount_total),
    rupeesCell(o.shipping_total),
    rupeesCell(o.cod_fee),
    rupeesCell(o.tax_total),
    rupeesCell(o.grand_total),
    rupeesCell(o.refunded_total),
    o.discount_code,
  ];
}

/**
 * Search term → safe PostgREST fragments. Only characters that cannot break an `or=()`
 * filter are kept (no commas, parentheses, quotes, backslashes, asterisks).
 */
export function sanitizeSearch(q: string | null | undefined): { text: string; digits: string; orderNumber: number | null } | null {
  if (!q) return null;
  const text = q.trim().replace(/[^\p{L}\p{N}@._+\- ]/gu, "").slice(0, 80).trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  const numMatch = /^#?(\d{1,12})$/.exec(q.trim());
  return { text, digits, orderNumber: numMatch ? Number(numMatch[1]) : null };
}
