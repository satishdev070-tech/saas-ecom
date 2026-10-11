import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { addDays, istDayStart } from "@/features/analytics/dates";
import type { TenantContext } from "@/lib/tenant/membership";
import { TXN_EXPORT_MAX, summarizeTransactions, txnSearch, type TxnFilters, type TxnRow, type TxnSummary } from "./transactions-format";

/**
 * Payment transactions for the seller dashboard. Reads go through the user's session, so RLS
 * (`payments_staff`: orders.read) applies on top of the explicit tenant filter.
 */

const COLUMNS = "id, order_id, provider, provider_order_id, provider_payment_id, amount, currency, status, method, error_description, paid_at, created_at, orders(order_number, email, phone)";
const SUMMARY_CHUNK = 1000;
const SUMMARY_MAX = 20_000;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Online gateway rows only: COD rows (if any) are not transactions with a gateway. */
async function filtered<T extends string>(supabase: Supabase, ctx: TenantContext, f: TxnFilters, columns: T, count?: "exact") {
  let q = supabase.from("payments").select(columns, count ? { count } : undefined).eq("tenant_id", ctx.tenantId).neq("provider", "cod");
  if (f.provider) q = q.eq("provider", f.provider);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("created_at", istDayStart(f.from).toISOString());
  if (f.to) q = q.lt("created_at", istDayStart(addDays(f.to, 1)).toISOString());
  const s = txnSearch(f.q);
  if (s) {
    const ors = [`provider_order_id.ilike.%${s.text}%`, `provider_payment_id.ilike.%${s.text}%`];
    if (s.orderNumber !== null) {
      const { data } = await supabase.from("orders").select("id").eq("tenant_id", ctx.tenantId).eq("order_number", s.orderNumber).maybeSingle();
      if (data) ors.push(`order_id.eq.${data.id}`);
    }
    q = q.or(ors.join(","));
  }
  // Wrapped: returning the builder itself from an async function would execute it (it's thenable).
  return { q };
}

export async function queryTransactions(ctx: TenantContext, f: TxnFilters, range: { offset: number; limit: number }): Promise<{ rows: TxnRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  const { q } = await filtered(supabase, ctx, f, COLUMNS, "exact");
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(range.offset, range.offset + range.limit - 1);
  if (error) throw mapDbError(error);
  const rows = (data ?? []) as unknown as TxnRow[];
  return { rows, total: count ?? rows.length };
}

/** Totals for the filtered set (light columns only, paged; capped for very large stores). */
export async function transactionSummary(ctx: TenantContext, f: TxnFilters): Promise<TxnSummary & { capped: boolean }> {
  const supabase = await createSupabaseServerClient();
  const rows: { status: string; amount: number; provider: string }[] = [];
  for (let offset = 0; offset < SUMMARY_MAX; offset += SUMMARY_CHUNK) {
    const { q } = await filtered(supabase, ctx, { ...f, page: 1 }, "status, amount, provider");
    const { data, error } = await q.order("created_at", { ascending: false }).range(offset, offset + SUMMARY_CHUNK - 1);
    if (error) throw mapDbError(error);
    rows.push(...((data ?? []) as unknown as typeof rows));
    if (!data || data.length < SUMMARY_CHUNK) return { ...summarizeTransactions(rows), capped: false };
  }
  return { ...summarizeTransactions(rows), capped: true };
}

/** Refunds sent (processed or pending) in the same date window. */
export async function refundTotal(ctx: TenantContext, f: TxnFilters): Promise<{ amountMinor: number; count: number }> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("refunds").select("amount").eq("tenant_id", ctx.tenantId).neq("status", "failed");
  if (f.from) q = q.gte("created_at", istDayStart(f.from).toISOString());
  if (f.to) q = q.lt("created_at", istDayStart(addDays(f.to, 1)).toISOString());
  const { data, error } = await q.limit(5000);
  if (error) throw mapDbError(error);
  return { amountMinor: (data ?? []).reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0), count: data?.length ?? 0 };
}

export async function exportTransactions(ctx: TenantContext, f: TxnFilters) {
  const rows: TxnRow[] = [];
  let total = 0;
  for (let offset = 0; offset < TXN_EXPORT_MAX; offset += 1000) {
    const page = await queryTransactions(ctx, f, { offset, limit: Math.min(1000, TXN_EXPORT_MAX - offset) });
    rows.push(...page.rows);
    total = page.total;
    if (page.rows.length < 1000 || rows.length >= total) break;
  }
  return { rows, total, truncated: total > rows.length };
}
