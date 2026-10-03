import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { getStoreCustomer } from "@/features/customer-account/session";
import { readOrderAddress, type OrderAddress } from "@/features/customer-account/address";
import { orderAccessToken, verifyOrderAccessToken } from "./order-access";
import { formatOrderNumber } from "./settings";
import { parseInvoiceData, type InvoiceData } from "./invoice";

/**
 * Shopper-facing order view. Access requires EITHER a valid signed order token (guest links
 * from the confirmation page / emails) OR the signed-in customer owning the order. The order
 * is always loaded with the host-resolved tenant id, so a token for another store finds nothing.
 */

export type OrderViewItem = {
  id: string;
  productId: string | null;
  title: string;
  variantTitle: string | null;
  options: Record<string, string>;
  imagePath: string | null;
  sku: string | null;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  compareAtPrice: number | null;
  discount: number;
  lineTotal: number;
};

export type OrderViewEvent = { id: number; type: string; message: string | null; at: string; data: Record<string, unknown> };
export type OrderViewShipment = { id: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null; deliveredAt: string | null };
export type OrderViewReturn = { id: string; number: number; status: string; reason: string; createdAt: string; refundAmount: number | null; items: { orderItemId: string; quantity: number }[] };

export type OrderView = {
  id: string;
  number: string;
  placedAt: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentMethod: "cod" | "online";
  email: string | null;
  phone: string;
  shippingAddress: OrderAddress | null;
  shippingMethod: string | null;
  note: string | null;
  cancelReason: string | null;
  customerId: string | null;
  subtotal: number;
  discountTotal: number;
  discountCode: string | null;
  shippingTotal: number;
  codFee: number;
  taxTotal: number;
  grandTotal: number;
  refundedTotal: number;
  pricesIncludeTax: boolean;
  items: OrderViewItem[];
  events: OrderViewEvent[];
  shipments: OrderViewShipment[];
  returns: OrderViewReturn[];
  hasInvoice: boolean;
  /** signed token for links (pay, invoice) */
  accessToken: string;
  /** viewer is the signed-in owning customer (may cancel/return) */
  viewerIsOwner: boolean;
  /** online order still awaiting payment */
  awaitingPayment: boolean;
};

export type OrderAccess = { tenantId: string; orderId: string; token?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the order view, or null when the order doesn't exist for this tenant or the viewer has no access. */
export const loadOrderView = cache(async (tenantId: string, orderId: string, token: string | null | undefined): Promise<OrderView | null> => {
  if (!UUID.test(orderId)) return null;
  const tokenOk = verifyOrderAccessToken(orderId, token);
  const customer = await getStoreCustomer(tenantId);
  if (!tokenOk && !customer) return null;

  const admin = createSupabaseAdminClient();
  const { data: o, error } = await admin
    .from("orders")
    .select(
      "id, order_number, placed_at, status, payment_status, fulfillment_status, payment_method, email, phone, shipping_address, shipping_rate_snapshot, note, cancel_reason, customer_id, subtotal, discount_total, discount_code, shipping_total, cod_fee, tax_total, grand_total, refunded_total, prices_include_tax",
    )
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    logger.error("order_view.load_failed", { tenantId, orderId, error: error.message });
    throw new Error("order lookup failed");
  }
  if (!o) return null;
  const viewerIsOwner = Boolean(customer && o.customer_id === customer.id);
  if (!tokenOk && !viewerIsOwner) return null;

  const [store, items, events, shipments, returns, invoice] = await Promise.all([
    admin.from("stores").select("order_prefix").eq("tenant_id", tenantId).maybeSingle(),
    admin
      .from("order_items")
      .select("id, product_id, product_title, variant_title, options, image_path, sku, quantity, returned_quantity, unit_price, compare_at_price, discount_total, line_total")
      .eq("tenant_id", tenantId)
      .eq("order_id", orderId)
      .order("product_title"),
    admin.from("order_events").select("id, type, message, data, created_at").eq("tenant_id", tenantId).eq("order_id", orderId).eq("visible_to_customer", true).order("created_at"),
    admin.from("shipments").select("id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at").eq("tenant_id", tenantId).eq("order_id", orderId).order("created_at", { ascending: false }),
    admin.from("returns").select("id, return_number, status, reason, created_at, refund_amount, return_items(order_item_id, quantity)").eq("tenant_id", tenantId).eq("order_id", orderId).order("created_at", { ascending: false }),
    admin.from("invoices").select("id").eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle(),
  ]);

  const rate = (o.shipping_rate_snapshot ?? null) as { name?: unknown } | null;
  return {
    id: o.id,
    number: formatOrderNumber(store.data?.order_prefix ?? "#", o.order_number),
    placedAt: o.placed_at,
    status: o.status as OrderView["status"],
    paymentStatus: o.payment_status,
    fulfillmentStatus: o.fulfillment_status,
    paymentMethod: o.payment_method === "cod" ? "cod" : "online",
    email: o.email,
    phone: o.phone,
    shippingAddress: readOrderAddress(o.shipping_address),
    shippingMethod: rate && typeof rate.name === "string" ? rate.name : null,
    note: o.note,
    cancelReason: o.cancel_reason,
    customerId: o.customer_id,
    subtotal: toMinor(o.subtotal),
    discountTotal: toMinor(o.discount_total),
    discountCode: o.discount_code,
    shippingTotal: toMinor(o.shipping_total),
    codFee: toMinor(o.cod_fee),
    taxTotal: toMinor(o.tax_total),
    grandTotal: toMinor(o.grand_total),
    refundedTotal: toMinor(o.refunded_total),
    pricesIncludeTax: o.prices_include_tax,
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      productId: i.product_id,
      title: i.product_title,
      variantTitle: i.variant_title,
      options: (i.options && typeof i.options === "object" && !Array.isArray(i.options) ? i.options : {}) as Record<string, string>,
      imagePath: i.image_path,
      sku: i.sku,
      quantity: i.quantity,
      returnedQuantity: i.returned_quantity,
      unitPrice: toMinor(i.unit_price),
      compareAtPrice: i.compare_at_price === null ? null : toMinor(i.compare_at_price),
      discount: toMinor(i.discount_total),
      lineTotal: toMinor(i.line_total),
    })),
    events: (events.data ?? []).map((e) => ({ id: e.id, type: e.type, message: e.message, at: e.created_at, data: (e.data ?? {}) as Record<string, unknown> })),
    shipments: (shipments.data ?? []).map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.tracking_number,
      trackingUrl: s.tracking_url && s.tracking_url.startsWith("https://") ? s.tracking_url : null,
      status: s.status,
      shippedAt: s.shipped_at,
      deliveredAt: s.delivered_at,
    })),
    returns: (returns.data ?? []).map((r) => ({
      id: r.id,
      number: r.return_number,
      status: r.status,
      reason: r.reason,
      createdAt: r.created_at,
      refundAmount: r.refund_amount === null ? null : toMinor(r.refund_amount),
      items: (r.return_items ?? []).map((x) => ({ orderItemId: x.order_item_id, quantity: x.quantity })),
    })),
    hasInvoice: Boolean(invoice.data),
    accessToken: orderAccessToken(o.id),
    viewerIsOwner,
    awaitingPayment: o.payment_method === "online" && o.payment_status === "pending" && o.status === "pending",
  };
});

/**
 * Invoice for a confirmed order the viewer may access (token or owner). Issued on first view
 * if the confirmation step didn't (svc_issue_invoice is idempotent: one invoice per order).
 */
export async function loadInvoice(tenantId: string, orderId: string, token: string | null | undefined): Promise<InvoiceData | null> {
  const view = await loadOrderView(tenantId, orderId, token);
  if (!view) return null;
  const invoiceable = view.status === "confirmed" || view.status === "completed";
  if (!invoiceable) return null;
  const admin = createSupabaseAdminClient();
  let { data: invoice } = await admin.from("invoices").select("invoice_number, issued_at, data").eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle();
  if (!invoice) {
    const { error } = await admin.rpc("svc_issue_invoice", { p_order: orderId });
    if (error) {
      logger.error("invoice.issue_failed", { tenantId, orderId, error: error.message });
      return null;
    }
    ({ data: invoice } = await admin.from("invoices").select("invoice_number, issued_at, data").eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle());
  }
  if (!invoice) return null;
  const { data: store } = await admin.from("stores").select("order_prefix").eq("tenant_id", tenantId).maybeSingle();
  return parseInvoiceData(invoice.invoice_number, invoice.issued_at, store?.order_prefix ?? "#", invoice.data);
}
