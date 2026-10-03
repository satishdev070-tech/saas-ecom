import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { assetUrl } from "@/lib/storage/assets";
import { platformOrigin } from "@/lib/platform/urls";
import { logger } from "@/lib/observability/logger";
import { sendEmail, type EmailSendResult } from "@/lib/email/send";
import { formatOrderNumber } from "@/features/checkout/settings";
import { orderPath, paymentPath, tenantStoreOrigin } from "@/features/checkout/order-access";
import { getPublishedThemeConfig } from "@/features/theme/server/queries";
import { CUSTOMISABLE_KEYS, type OrderNotificationKey, type Template } from "../templates";
import type { ChannelOutcome, NotificationChannel, NotificationEvent } from "../events";
import { resolveEmailPreferences, type EmailPreferenceKey, type EmailPreferences } from "./preferences";
import { renderCustomerOrderEmail, renderOwnerNewOrderEmail, type CustomerOrderKind, type EmailBrand, type OrderEmailData } from "./templates";

/**
 * Email channel for the notification dispatcher. Background job (ADR-006): uses the secret-key
 * client, always with the event's server-resolved tenant id AND the row id as filters.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "Requested — we'll review it shortly",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received by the store",
  refunded: "Refunded",
  closed: "Closed",
};

export type StoreContext = { brand: EmailBrand; storeEmail: string | null; origin: string | null; orderPrefix: string; prefs: EmailPreferences };

export async function loadStoreContext(admin: Admin, tenantId: string): Promise<StoreContext | null> {
  const [store, prefs, origin] = await Promise.all([
    admin.from("stores").select("name, email, logo_path, order_prefix").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("email_preferences").select("settings").eq("tenant_id", tenantId).maybeSingle(),
    tenantStoreOrigin(tenantId),
  ]);
  if (!store.data) return null;
  let accent: string | null = null;
  try {
    const theme = await getPublishedThemeConfig(tenantId);
    accent = theme.tokens.colors.primary ?? theme.tokens.colors.accent ?? null;
  } catch {
    accent = null; // theme cache unavailable outside a request: default colour
  }
  return {
    brand: { storeName: store.data.name, logoUrl: assetUrl(store.data.logo_path), accent, storeUrl: origin, supportEmail: store.data.email },
    storeEmail: store.data.email,
    origin,
    orderPrefix: store.data.order_prefix ?? "#",
    prefs: resolveEmailPreferences(prefs.data?.settings),
  };
}

/** Seller wording override; `false` when the seller switched this email off on its template. */
export async function loadCustomTemplate(admin: Admin, tenantId: string, key: OrderNotificationKey): Promise<Partial<Template> | null | false> {
  if (!CUSTOMISABLE_KEYS.has(key)) return null;
  const { data } = await admin.from("notification_templates").select("subject, body, active").eq("tenant_id", tenantId).eq("key", key).eq("channel", "email").maybeSingle();
  if (!data) return null;
  if (!data.active) return false;
  return { subject: data.subject ?? undefined, body: data.body };
}

function addressLines(raw: unknown): string[] {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return [str(a.name), str(a.line1), str(a.line2), str(a.landmark), [str(a.city), str(a.state), str(a.postal_code)].filter(Boolean).join(" ") || null].filter((x): x is string => Boolean(x));
}

type LoadedOrder = { data: OrderEmailData; email: string | null; phone: string | null; orderId: string; paymentStatus: string };

async function loadOrder(admin: Admin, tenantId: string, orderId: string, store: StoreContext): Promise<LoadedOrder | null> {
  const { data: o } = await admin
    .from("orders")
    .select("id, order_number, email, phone, payment_method, payment_status, subtotal, discount_total, shipping_total, cod_fee, tax_total, prices_include_tax, grand_total, refunded_total, cancel_reason, customer_snapshot, shipping_address")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return null;
  const [items, shipment] = await Promise.all([
    admin.from("order_items").select("product_title, variant_title, quantity, line_total").eq("tenant_id", tenantId).eq("order_id", orderId),
    admin.from("shipments").select("carrier, tracking_number, tracking_url").eq("tenant_id", tenantId).eq("order_id", orderId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const address = (o.shipping_address ?? {}) as Record<string, unknown>;
  const snapshot = (o.customer_snapshot ?? {}) as Record<string, unknown>;
  const customerName = String(snapshot.first_name ?? address.name ?? "there").trim().split(/\s+/)[0] || "there";
  const origin = store.origin;
  return {
    orderId: o.id,
    email: o.email,
    phone: o.phone,
    paymentStatus: o.payment_status,
    data: {
      brand: store.brand,
      customerName,
      orderNumber: formatOrderNumber(store.orderPrefix, o.order_number),
      orderUrl: origin ? `${origin}${orderPath(o.id)}` : null,
      paymentUrl: origin ? `${origin}${paymentPath(o.id)}` : null,
      paymentMethod: o.payment_method === "cod" ? "cod" : "online",
      items: (items.data ?? []).map((i) => ({ title: i.product_title, variant: i.variant_title && i.variant_title !== "Default" ? i.variant_title : null, quantity: i.quantity, totalMinor: toMinor(i.line_total) })),
      subtotalMinor: toMinor(o.subtotal),
      discountMinor: toMinor(o.discount_total),
      shippingMinor: toMinor(o.shipping_total),
      codFeeMinor: toMinor(o.cod_fee ?? 0),
      taxMinor: o.prices_include_tax ? 0 : toMinor(o.tax_total ?? 0),
      totalMinor: toMinor(o.grand_total),
      shippingAddress: addressLines(o.shipping_address),
      carrier: shipment.data?.carrier ?? null,
      trackingNumber: shipment.data?.tracking_number ?? null,
      trackingUrl: shipment.data?.tracking_url ?? null,
      refundAmountMinor: toMinor(o.refunded_total ?? 0),
      cancelReason: o.cancel_reason,
    },
  };
}

/** Maps a dispatcher event to the customer email it triggers (null = none). PURE. */
export function customerEmailFor(event: NotificationEvent): CustomerOrderKind | null {
  switch (event.type) {
    case "order.placed":
      return "order_placed";
    case "order.status_changed":
      return event.status === "payment_failed" ? "payment_failed" : event.status === "cancelled" ? "order_cancelled" : event.status === "refunded" ? "refund_processed" : null;
    case "shipment.updated":
      return event.status === "shipped" ? "order_shipped" : event.status === "out_for_delivery" ? "out_for_delivery" : "order_delivered";
    case "return.updated":
      // "refunded" is covered by the refund email; "closed" is internal housekeeping.
      return event.status === "refunded" || event.status === "closed" ? null : "return_update";
    case "cart.abandoned":
      return null;
  }
}

function toOutcome(r: EmailSendResult): ChannelOutcome {
  if (r.status === "sent") return { status: "sent" };
  if (r.status === "failed") return { status: "failed", detail: r.error };
  return { status: "skipped", detail: r.error ?? r.status };
}

async function handle(event: NotificationEvent, ctx: { idempotencyKey: string }): Promise<ChannelOutcome> {
  if (event.type === "cart.abandoned") {
    const { sendAbandonedCartEmail } = await import("./abandoned");
    return sendAbandonedCartEmail(event.tenantId, event.cartId, ctx.idempotencyKey);
  }
  const kind = customerEmailFor(event);
  // A manual re-send (resendNonce) is customer-only and ignores the store toggles.
  const wantsOwnerAlert = event.type === "order.placed" && !event.resendNonce;
  if (!kind && !wantsOwnerAlert) return { status: "skipped", detail: "no email for this event" };

  const admin = createSupabaseAdminClient();
  const store = await loadStoreContext(admin, event.tenantId);
  if (!store) return { status: "skipped", detail: "store not found" };
  const order = await loadOrder(admin, event.tenantId, event.orderId, store);
  if (!order) return { status: "skipped", detail: "order not found" };

  const outcomes: ChannelOutcome[] = [];

  if (kind && (event.resendNonce || store.prefs[kind as EmailPreferenceKey] !== false)) {
    if (kind === "payment_failed" && order.paymentStatus === "paid") {
      outcomes.push({ status: "skipped", detail: "already paid" });
    } else if (!order.email) {
      outcomes.push({ status: "skipped", detail: "no customer email" });
    } else {
      const custom = await loadCustomTemplate(admin, event.tenantId, kind);
      if (custom === false) {
        outcomes.push({ status: "skipped", detail: "template switched off" });
      } else {
        const data: OrderEmailData = { ...order.data };
        if (event.type === "order.status_changed" && event.refundAmountMinor !== undefined) data.refundAmountMinor = event.refundAmountMinor;
        if (event.type === "order.status_changed" && event.cancelReason) data.cancelReason = event.cancelReason;
        if (event.type === "return.updated") data.returnStatus = RETURN_STATUS_LABELS[event.status] ?? event.status;
        const email = renderCustomerOrderEmail(kind, data, custom);
        const r = await sendEmail({ tenantId: event.tenantId, kind, to: order.email, ...email, fromName: store.brand.storeName, replyTo: store.storeEmail, idempotencyKey: ctx.idempotencyKey });
        outcomes.push(toOutcome(r));
      }
    }
  }

  if (wantsOwnerAlert && store.prefs.owner_new_order && store.storeEmail) {
    const email = renderOwnerNewOrderEmail({ ...order.data, dashboardUrl: `${platformOrigin()}/dashboard/orders/${order.orderId}`, customerEmail: order.email, customerPhone: order.phone });
    const r = await sendEmail({
      tenantId: event.tenantId,
      kind: "owner_new_order",
      to: store.storeEmail,
      ...email,
      fromName: store.brand.storeName,
      replyTo: order.email,
      idempotencyKey: `${ctx.idempotencyKey}:owner`,
    });
    outcomes.push(toOutcome(r));
  }

  if (outcomes.some((o) => o.status === "failed")) {
    logger.warn("email.channel_partial_failure", { tenantId: event.tenantId, event: event.type });
    return outcomes.find((o) => o.status === "failed")!;
  }
  return outcomes.find((o) => o.status === "sent") ?? outcomes[0] ?? { status: "skipped", detail: "switched off" };
}

export const channel: NotificationChannel = { name: "email", handle };
