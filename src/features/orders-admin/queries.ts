import "server-only";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { addDays, istDayStart } from "@/features/analytics/dates";
import type { TenantContext } from "@/lib/tenant/membership";
import type { OrderFilters } from "./schemas";
import { sanitizeSearch } from "./format";

export const ORDERS_PAGE_SIZE = 25;
export const EXPORT_MAX_ROWS = 5000;

const ORDER_LIST_COLUMNS =
  "id, order_number, placed_at, status, payment_status, fulfillment_status, payment_method, email, phone, subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, refunded_total, discount_code, shipping_address, customer_id";

/** Orders list/export with filters. RLS (orders.read) + explicit tenant filter. */
export async function queryOrders(ctx: TenantContext, f: OrderFilters, range: { offset: number; limit: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("orders").select(ORDER_LIST_COLUMNS, { count: "exact" }).eq("tenant_id", ctx.tenantId);
  if (f.status) q = q.eq("status", f.status);
  if (f.payment) q = q.eq("payment_status", f.payment);
  if (f.fulfillment) q = q.eq("fulfillment_status", f.fulfillment);
  if (f.method) q = q.eq("payment_method", f.method);
  if (f.from) q = q.gte("placed_at", istDayStart(f.from).toISOString());
  if (f.to) q = q.lt("placed_at", istDayStart(addDays(f.to, 1)).toISOString());
  const s = sanitizeSearch(f.q);
  if (s) {
    const ors = [`email.ilike.%${s.text}%`];
    if (s.digits.length >= 4) ors.push(`phone.ilike.%${s.digits}%`);
    if (s.orderNumber !== null) ors.push(`order_number.eq.${s.orderNumber}`);
    q = q.or(ors.join(","));
  }
  const { data, error, count } = await q.order("placed_at", { ascending: false }).range(range.offset, range.offset + range.limit - 1);
  if (error) throw mapDbError(error);
  return { rows: data, total: count ?? data.length };
}

/** PostgREST caps a response at 1000 rows, so exports page through in chunks. */
const EXPORT_CHUNK = 1000;

export async function exportOrders(ctx: TenantContext, f: OrderFilters) {
  const rows: Awaited<ReturnType<typeof queryOrders>>["rows"] = [];
  let total = 0;
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_CHUNK) {
    const page = await queryOrders(ctx, f, { offset, limit: Math.min(EXPORT_CHUNK, EXPORT_MAX_ROWS - offset) });
    rows.push(...page.rows);
    total = page.total;
    if (page.rows.length < EXPORT_CHUNK || rows.length >= total) break;
  }
  return { rows, total, truncated: total > rows.length };
}

export async function recentOrders(ctx: TenantContext, limit = 5) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, placed_at, status, payment_status, fulfillment_status, grand_total, email, phone, shipping_address")
    .eq("tenant_id", ctx.tenantId)
    .order("placed_at", { ascending: false })
    .limit(limit);
  if (error) throw mapDbError(error);
  return data;
}

export async function getOrderDetail(ctx: TenantContext, orderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase.from("orders").select("*").eq("tenant_id", ctx.tenantId).eq("id", orderId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!order) notFound();
  const [items, events, payments, refunds, shipments, returns, invoice] = await Promise.all([
    supabase.from("order_items").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("product_title"),
    supabase.from("order_events").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("created_at", { ascending: false }).limit(200),
    supabase.from("payments").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("created_at"),
    supabase.from("refunds").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("created_at"),
    supabase.from("shipments").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("returns").select("id, return_number, status, reason, created_at").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).order("created_at"),
    supabase.from("invoices").select("id, invoice_number, issued_at").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).maybeSingle(),
  ]);
  for (const r of [items, events, payments, refunds, shipments, returns, invoice]) if (r.error) throw mapDbError(r.error);
  let customer: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; orders_count: number; status: string } | null = null;
  if (order.customer_id) {
    const { data } = await supabase.from("customers").select("id, first_name, last_name, email, phone, orders_count, status").eq("tenant_id", ctx.tenantId).eq("id", order.customer_id).maybeSingle();
    customer = data;
  }
  return {
    order,
    items: items.data ?? [],
    events: events.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    shipments: shipments.data ?? [],
    returns: returns.data ?? [],
    invoice: invoice.data ?? null,
    customer,
  };
}

export async function getInvoice(ctx: TenantContext, orderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("invoices").select("*").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).maybeSingle();
  if (error) throw mapDbError(error);
  return data;
}

export const RETURNS_PAGE_SIZE = 25;

export async function listReturns(ctx: TenantContext, f: { status?: string; page: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("returns")
    .select("id, return_number, status, resolution, reason, refund_amount, created_at, order_id, orders!inner(order_number, email, phone, shipping_address)", { count: "exact" })
    .eq("tenant_id", ctx.tenantId);
  if (f.status) q = q.eq("status", f.status);
  const offset = (f.page - 1) * RETURNS_PAGE_SIZE;
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + RETURNS_PAGE_SIZE - 1);
  if (error) throw mapDbError(error);
  return { rows: data, total: count ?? data.length };
}

export async function getReturnDetail(ctx: TenantContext, returnId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: ret, error } = await supabase.from("returns").select("*").eq("tenant_id", ctx.tenantId).eq("id", returnId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!ret) notFound();
  const [order, items, refunds] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, email, phone, shipping_address, grand_total, refunded_total, payment_status, payment_method, placed_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", ret.order_id)
      .single(),
    supabase
      .from("return_items")
      .select("quantity, reason, order_item_id, order_items!inner(product_title, variant_title, sku, unit_price, quantity, discount_total, image_path)")
      .eq("tenant_id", ctx.tenantId)
      .eq("return_id", returnId),
    supabase.from("refunds").select("*").eq("tenant_id", ctx.tenantId).eq("return_id", returnId).order("created_at"),
  ]);
  if (order.error) throw mapDbError(order.error);
  if (items.error) throw mapDbError(items.error);
  if (refunds.error) throw mapDbError(refunds.error);
  return { ret, order: order.data, items: items.data, refunds: refunds.data };
}
