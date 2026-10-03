import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { activeWhatsApp } from "@/features/inbox/server/whatsapp";
import { normalizeWhatsAppPhone } from "./phone";

/**
 * WhatsApp consent ledger (customer_whatsapp_optins). Written server-side only with a
 * server-resolved tenant (checkout: verified host; STOP/START: verified webhook mapping).
 */
type Admin = ReturnType<typeof createSupabaseAdminClient>;

export { OPT_IN_LABEL_TEXT } from "./opt-in-text";

/** Records an explicit opt-in (checkbox ticked). Best-effort: never throws into checkout. */
export async function recordWhatsAppOptIn(input: { tenantId: string; phone: string; customerId?: string | null; orderId?: string | null; source?: "checkout" | "account"; consentText: string }): Promise<boolean> {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return false;
  const now = new Date().toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("customer_whatsapp_optins")
    .upsert(
      { tenant_id: input.tenantId, phone, customer_id: input.customerId ?? null, order_id: input.orderId ?? null, opted_in: true, source: input.source ?? "checkout", consent_text: input.consentText.slice(0, 500), consented_at: now, revoked_at: null },
      { onConflict: "tenant_id,phone" },
    );
  if (error) logger.warn("whatsapp_notify.optin_failed", { tenantId: input.tenantId, error: error.message });
  return !error;
}

/** STOP / START keywords from a verified inbound WhatsApp message. */
export async function setOptInFromKeyword(admin: Admin, tenantId: string, phone: string, optedIn: boolean): Promise<void> {
  const e164 = normalizeWhatsAppPhone(phone.startsWith("+") ? phone : `+${phone}`);
  if (!e164) return;
  const now = new Date().toISOString();
  if (optedIn) {
    // START only re-enables someone who opted in before and later sent STOP.
    await admin.from("customer_whatsapp_optins").update({ opted_in: true, source: "inbound_start", revoked_at: null, consented_at: now }).eq("tenant_id", tenantId).eq("phone", e164);
  } else {
    await admin.from("customer_whatsapp_optins").upsert({ tenant_id: tenantId, phone: e164, opted_in: false, source: "inbound_stop", revoked_at: now }, { onConflict: "tenant_id,phone" });
  }
}

export async function isOptedIn(admin: Admin, tenantId: string, phone: string): Promise<boolean> {
  const { data } = await admin.from("customer_whatsapp_optins").select("opted_in").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
  return data?.opted_in === true;
}

/**
 * Whether checkout should show the WhatsApp opt-in checkbox: WhatsApp connected AND at least one
 * order event enabled. Stores without WhatsApp notifications render checkout unchanged.
 */
export async function whatsappOptInAvailable(tenantId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const { count } = await admin.from("whatsapp_notification_settings").select("event", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("enabled", true);
    if (!count) return false;
    return (await activeWhatsApp(tenantId)) !== null;
  } catch {
    return false;
  }
}
