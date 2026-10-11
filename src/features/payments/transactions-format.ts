import { z } from "zod";
import { isDateKey } from "@/features/analytics/dates";
import type { CsvValue } from "@/features/analytics/csv";
import { toMinor } from "@/lib/money";
import type { Tone } from "@/features/orders-admin/format";

/**
 * Payment transactions (Dashboard → Payments). Pure helpers shared by the page, the CSV export
 * and tests. A "transaction" is one row of `payments`: every gateway attempt (Razorpay order,
 * Cashfree order, PayU txnid), whether it was captured, failed or abandoned.
 */

export const TXN_PROVIDERS = ["razorpay", "cashfree", "payu", "manual"] as const;
export const TXN_STATUSES = ["created", "authorized", "captured", "failed", "refunded", "partially_refunded"] as const;
export type TxnProvider = (typeof TXN_PROVIDERS)[number];
export type TxnStatus = (typeof TXN_STATUSES)[number];

export const TXN_PAGE_SIZE = 25;
export const TXN_EXPORT_MAX = 5000;

const PROVIDER_LABELS: Record<string, string> = { razorpay: "Razorpay", cashfree: "Cashfree", payu: "PayU", manual: "Test payment", cod: "Cash on delivery" };
const STATUS_LABELS: Record<string, string> = {
  created: "Started",
  authorized: "Authorised",
  captured: "Successful",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};
const STATUS_TONES: Record<string, Tone> = { created: "neutral", authorized: "warning", captured: "success", failed: "error", refunded: "neutral", partially_refunded: "warning" };

export const providerLabel = (p: string) => PROVIDER_LABELS[p] ?? p;
export const txnStatusLabel = (s: string) => STATUS_LABELS[s] ?? s.replace(/_/g, " ");
export const txnStatusTone = (s: string): Tone => STATUS_TONES[s] ?? "neutral";

/** Payment method as reported by the gateway (upi, card, netbanking, UPI, CREDIT_CARD…) → readable label. */
export function methodLabel(m: string | null | undefined): string {
  if (!m) return "—";
  const k = m.toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    upi: "UPI",
    card: "Card",
    credit_card: "Credit card",
    debit_card: "Debit card",
    cc: "Credit card",
    dc: "Debit card",
    netbanking: "Net banking",
    net_banking: "Net banking",
    nb: "Net banking",
    wallet: "Wallet",
    emi: "EMI",
    cardless_emi: "Cardless EMI",
    pay_later: "Pay later",
    paylater: "Pay later",
    bank_transfer: "Bank transfer",
    test: "Test",
    online: "Online",
  };
  return map[k] ?? m.slice(0, 24);
}

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().catch(undefined);
const dateKey = z
  .string()
  .optional()
  .transform((v) => (isDateKey(v) ? v : undefined));

export const txnFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  provider: optionalEnum(TXN_PROVIDERS),
  status: optionalEnum(TXN_STATUSES),
  from: dateKey,
  to: dateKey,
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type TxnFilters = z.infer<typeof txnFiltersSchema>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseTxnFilters(sp: Record<string, string | string[] | undefined>): TxnFilters {
  return txnFiltersSchema.parse({
    q: first(sp.q) || undefined,
    provider: first(sp.provider) || undefined,
    status: first(sp.status) || undefined,
    from: first(sp.from) || undefined,
    to: first(sp.to) || undefined,
    page: first(sp.page) ?? 1,
  });
}

/**
 * Search term → safe PostgREST filter pieces. Only [A-Za-z0-9_-] survive, so the value can't
 * break out of an `or=(…)` expression. A purely numeric term (optionally "#123") also matches the
 * order number.
 */
export function txnSearch(q: string | undefined): { text: string; orderNumber: number | null } | null {
  if (!q) return null;
  const text = q.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  if (!text) return null;
  const digits = q.replace(/^#/, "").trim();
  const orderNumber = /^\d{1,9}$/.test(digits) ? Number(digits) : null;
  return { text, orderNumber };
}

export type TxnSummaryInput = { status: string; amount: number; provider: string };
export type TxnSummary = {
  /** captured + (partly) refunded attempts = money that was collected */
  collectedMinor: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  totalCount: number;
  /** successful / (successful + failed); null when nothing finished yet */
  successRate: number | null;
  byProvider: { provider: string; collectedMinor: number; count: number }[];
};

const COLLECTED = new Set(["captured", "refunded", "partially_refunded"]);

/** Totals over a set of payment rows (amounts in rupees as stored; result in paise). */
export function summarizeTransactions(rows: readonly TxnSummaryInput[]): TxnSummary {
  let collectedMinor = 0;
  let successCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  const per = new Map<string, { collectedMinor: number; count: number }>();
  for (const r of rows) {
    const p = per.get(r.provider) ?? { collectedMinor: 0, count: 0 };
    if (COLLECTED.has(r.status)) {
      const m = toMinor(r.amount);
      collectedMinor += m;
      successCount += 1;
      p.collectedMinor += m;
      p.count += 1;
    } else if (r.status === "failed") failedCount += 1;
    else pendingCount += 1;
    per.set(r.provider, p);
  }
  const finished = successCount + failedCount;
  return {
    collectedMinor,
    successCount,
    failedCount,
    pendingCount,
    totalCount: rows.length,
    successRate: finished ? successCount / finished : null,
    byProvider: [...per.entries()].map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.collectedMinor - a.collectedMinor),
  };
}

export const TXN_CSV_HEADER = ["Created", "Paid at", "Order", "Gateway", "Status", "Method", "Amount (INR)", "Currency", "Gateway order ID", "Gateway payment ID", "Customer email", "Customer phone", "Error"] as const;

export type TxnRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  error_description: string | null;
  paid_at: string | null;
  created_at: string;
  orders: { order_number: number; email: string | null; phone: string | null } | null;
};

export function txnCsvRow(r: TxnRow, orderLabel: (n: number) => string): CsvValue[] {
  return [
    r.created_at,
    r.paid_at,
    r.orders ? orderLabel(r.orders.order_number) : "",
    providerLabel(r.provider),
    txnStatusLabel(r.status),
    methodLabel(r.method),
    Number(r.amount),
    r.currency,
    r.provider_order_id,
    r.provider_payment_id,
    r.orders?.email ?? "",
    r.orders?.phone ?? "",
    r.error_description,
  ];
}
