import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { activeWhatsApp } from "@/features/inbox/server/whatsapp";
import { formatOrderNumber } from "@/features/checkout/settings";
import { orderPath, tenantStoreOrigin } from "@/features/checkout/order-access";
import type { ChannelOutcome, NotificationChannel, NotificationEvent } from "../events";
import { isOptedIn } from "./consent";
import { normalizeWhatsAppPhone } from "./phone";
import { gate, whatsappEventFor } from "./policy";
import { enqueueJob, processJob } from "./queue";
import { renderPreview, resolveParams, type ParamFormat, type TemplateValues, type WhatsAppEvent } from "./templates";

/**
 * WhatsApp channel for the shared dispatcher (src/features/notifications/events.ts).
 * Gating: store has WhatsApp connected + event enabled and mapped to an approved template +
 * customer opted in with a valid E.164 number. Then a job is queued (idempotent per event) and
 * sent immediately; failures retry from the cron with backoff.
 */
type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Recipient = { phone: string | null; values: TemplateValues; orderId: string | null; cartId: string | null };

const firstName = (v: unknown) => (typeof v === "string" ? v.trim().split(/\s+/)[0] : "") || "there";

async function storeBasics(admin: Admin, tenantId: string) {
  const [store, tenant, domainOrigin] = await Promise.all([
    admin.from("stores").select("name, order_prefix").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenants").select("slug").eq("id", tenantId).maybeSingle(),
    tenantStoreOrigin(tenantId),
  ]);
  const origin = domainOrigin ?? (tenant.data?.slug ? storeOrigin(storeSubdomain(tenant.data.slug)) : null);
  return { name: store.data?.name ?? "our store", prefix: store.data?.order_prefix ?? "#", origin };
}

async function orderRecipient(admin: Admin, event: Extract<NotificationEvent, { orderId: string }>, wa: WhatsAppEvent): Promise<Recipient | null> {
  const { data: order } = await admin.from("orders").select("id, order_number, phone, grand_total, customer_snapshot, shipping_address").eq("tenant_id", event.tenantId).eq("id", event.orderId).maybeSingle();
  if (!order) return null;
  const store = await storeBasics(admin, event.tenantId);
  const snap = (order.customer_snapshot ?? {}) as Record<string, unknown>;
  const addr = (order.shipping_address ?? {}) as Record<string, unknown>;
  const orderUrl = store.origin ? `${store.origin}${orderPath(order.id)}` : null;
  const values: TemplateValues = {
    customer_name: firstName(snap.first_name ?? addr.name),
    store_name: store.name,
    order_number: formatOrderNumber(store.prefix, order.order_number),
    order_total: formatMoney(toMinor(order.grand_total)),
  };
  if (wa === "order_shipped" || wa === "out_for_delivery" || wa === "order_delivered") {
    const shipmentId = event.type === "shipment.updated" ? event.shipmentId : null;
    let q = admin.from("shipments").select("carrier, tracking_number, tracking_url").eq("tenant_id", event.tenantId).eq("order_id", order.id);
    if (shipmentId) q = q.eq("id", shipmentId);
    const { data: s } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    values.carrier = s?.carrier || "our courier partner";
    values.tracking_number = s?.tracking_number || "-";
    values.tracking_url = s?.tracking_url || orderUrl || store.origin || "-";
  }
  return { phone: normalizeWhatsAppPhone(order.phone), values, orderId: order.id, cartId: null };
}

async function cartRecipient(admin: Admin, tenantId: string, cartId: string): Promise<Recipient | null> {
  const { data: cart } = await admin.from("carts").select("id, customer_id, status").eq("tenant_id", tenantId).eq("id", cartId).maybeSingle();
  if (!cart?.customer_id || cart.status !== "active") return null;
  const { data: customer } = await admin.from("customers").select("phone, first_name, status").eq("tenant_id", tenantId).eq("id", cart.customer_id).maybeSingle();
  if (!customer || customer.status !== "active") return null;
  const store = await storeBasics(admin, tenantId);
  return { phone: normalizeWhatsAppPhone(customer.phone), values: { customer_name: firstName(customer.first_name), store_name: store.name, cart_url: store.origin ? `${store.origin}/cart` : "-" }, orderId: null, cartId: cart.id };
}

export async function handleWhatsAppEvent(event: NotificationEvent, idempotencyKey: string): Promise<ChannelOutcome> {
  const wa = whatsappEventFor(event);
  if (!wa) return { status: "skipped", detail: "event not handled" };
  const admin = createSupabaseAdminClient();
  const [{ data: setting }, conn] = await Promise.all([
    admin.from("whatsapp_notification_settings").select("enabled, template_name, language_code, body_text, param_format, param_names").eq("tenant_id", event.tenantId).eq("event", wa).maybeSingle(),
    activeWhatsApp(event.tenantId).catch(() => null),
  ]);
  const settingInput = setting ? { enabled: setting.enabled, templateName: setting.template_name, languageCode: setting.language_code } : null;
  // Cheap checks first: most stores never get past these.
  if (!conn) return { status: "skipped", detail: "whatsapp not connected" };
  if (!settingInput?.enabled || !settingInput.templateName) return { status: "skipped", detail: "event disabled or not mapped" };

  const recipient = event.type === "cart.abandoned" ? await cartRecipient(admin, event.tenantId, event.cartId) : "orderId" in event ? await orderRecipient(admin, event, wa) : null;
  if (!recipient) return { status: "skipped", detail: "no recipient" };
  const optedIn = recipient.phone ? await isOptedIn(admin, event.tenantId, recipient.phone) : false;
  const g = gate({ connected: true, setting: settingInput, phone: recipient.phone, optedIn });
  if (!g.send) return { status: "skipped", detail: g.reason };

  const format = setting!.param_format as ParamFormat;
  const params = resolveParams(wa, format, setting!.param_names, recipient.values);
  const jobId = await enqueueJob({
    tenantId: event.tenantId,
    event: wa,
    idempotencyKey,
    orderId: recipient.orderId,
    cartId: recipient.cartId,
    recipient: g.to,
    templateName: g.templateName,
    languageCode: g.languageCode,
    params,
    preview: renderPreview(setting!.body_text, format, params, g.templateName),
  });
  if (!jobId) return { status: "skipped", detail: "already queued" };
  const status = await processJob(jobId);
  if (status === "sent") return { status: "sent" };
  if (status === "queued") return { status: "failed", detail: "queued for retry" };
  return { status: "failed", detail: status ?? "not claimed" };
}

export const channel: NotificationChannel = {
  name: "whatsapp",
  async handle(event, ctx) {
    try {
      return await handleWhatsAppEvent(event, ctx.idempotencyKey);
    } catch (err) {
      logger.error("whatsapp_notify.handle_failed", { tenantId: event.tenantId, event: event.type, error: err });
      return { status: "failed", detail: "internal error" };
    }
  },
};
