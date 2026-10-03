import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Abandoned carts eligible for a WhatsApp reminder: stores with the WhatsApp abandoned_cart
 * event enabled, active carts of SIGNED-IN customers (guest carts have no customer/phone), idle
 * 2–72 hours with at least one item. Opt-in and phone are checked again by the channel.
 */
const MIN_IDLE_HOURS = 2;
const MAX_IDLE_HOURS = 72;

export async function findWhatsAppAbandonedCarts(limit = 100): Promise<Array<{ tenantId: string; cartId: string }>> {
  const admin = createSupabaseAdminClient();
  const { data: enabled } = await admin.from("whatsapp_notification_settings").select("tenant_id").eq("event", "abandoned_cart").eq("enabled", true);
  const tenants = (enabled ?? []).map((r) => r.tenant_id);
  if (!tenants.length) return [];
  const now = Date.now();
  const { data: carts } = await admin
    .from("carts")
    .select("id, tenant_id, cart_items!inner(id)")
    .in("tenant_id", tenants)
    .eq("status", "active")
    .not("customer_id", "is", null)
    .eq("cart_items.saved_for_later", false)
    .lt("updated_at", new Date(now - MIN_IDLE_HOURS * 3600_000).toISOString())
    .gt("updated_at", new Date(now - MAX_IDLE_HOURS * 3600_000).toISOString())
    .limit(limit);
  if (!carts?.length) return [];
  // Skip carts that already have a reminder job (sent, failed or retrying).
  const { data: done } = await admin.from("notification_jobs").select("cart_id").eq("event", "abandoned_cart").in("cart_id", carts.map((c) => c.id));
  const seen = new Set((done ?? []).map((d) => d.cart_id));
  return carts.filter((c) => !seen.has(c.id)).map((c) => ({ tenantId: c.tenant_id, cartId: c.id }));
}
