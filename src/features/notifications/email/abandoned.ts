import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { sendEmail } from "@/lib/email/send";
import { paths } from "@/features/storefront/urls";
import type { ChannelOutcome } from "../events";
import { emit } from "../events";
import { loadCustomTemplate, loadStoreContext } from "./channel";
import { renderAbandonedCartEmail } from "./templates";

/**
 * Abandoned-cart reminders. Only carts that carry an email qualify — today that means carts of
 * SIGNED-IN customers (guest carts never store an email). Opt-in per store (default off).
 * Background job (ADR-006): secret-key client with explicit tenant filters.
 */

const MIN_IDLE_HOURS = 2;
const MAX_IDLE_HOURS = 72;

/** Carts idle 2–72 h with an email, in stores that switched the reminder on. */
export async function findAbandonedCarts(limit = 100): Promise<Array<{ tenantId: string; cartId: string }>> {
  const admin = createSupabaseAdminClient();
  const { data: prefs } = await admin.from("email_preferences").select("tenant_id").eq("settings->>abandoned_cart", "true");
  const tenants = (prefs ?? []).map((p) => p.tenant_id);
  if (!tenants.length) return [];
  const now = Date.now();
  const { data: carts } = await admin
    .from("carts")
    .select("id, tenant_id, cart_items!inner(id)")
    .in("tenant_id", tenants)
    .eq("status", "active")
    .not("email", "is", null)
    .eq("cart_items.saved_for_later", false)
    .lt("updated_at", new Date(now - MIN_IDLE_HOURS * 3600_000).toISOString())
    .gt("updated_at", new Date(now - MAX_IDLE_HOURS * 3600_000).toISOString())
    .limit(limit);
  return (carts ?? []).map((c) => ({ tenantId: c.tenant_id, cartId: c.id }));
}

/** For role D's cron: emits `cart.abandoned` for each candidate. Idempotency keys stop repeats. */
export async function emitAbandonedCarts(limit = 100): Promise<number> {
  const carts = await findAbandonedCarts(limit);
  for (const c of carts) emit({ type: "cart.abandoned", tenantId: c.tenantId, cartId: c.cartId });
  return carts.length;
}

export async function sendAbandonedCartEmail(tenantId: string, cartId: string, idempotencyKey: string): Promise<ChannelOutcome> {
  const admin = createSupabaseAdminClient();
  const store = await loadStoreContext(admin, tenantId);
  if (!store) return { status: "skipped", detail: "store not found" };
  if (!store.prefs.abandoned_cart) return { status: "skipped", detail: "switched off" };
  const { data: cart } = await admin.from("carts").select("id, email, status, customer_id").eq("tenant_id", tenantId).eq("id", cartId).maybeSingle();
  if (!cart || cart.status !== "active" || !cart.email) return { status: "skipped", detail: "cart not eligible" };
  const custom = await loadCustomTemplate(admin, tenantId, "abandoned_cart");
  if (custom === false) return { status: "skipped", detail: "template switched off" };

  const [{ data: rows }, customer] = await Promise.all([
    admin.from("cart_items").select("quantity, product_variants(title, price, products(title))").eq("tenant_id", tenantId).eq("cart_id", cartId).eq("saved_for_later", false).limit(10),
    cart.customer_id ? admin.from("customers").select("first_name").eq("tenant_id", tenantId).eq("id", cart.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const items = (rows ?? []).flatMap((r) => {
    const v = r.product_variants as unknown as { title: string; price: number | string; products: { title: string } | null } | null;
    if (!v) return [];
    return [{ title: v.products?.title ?? v.title, variant: v.title !== "Default" ? v.title : null, quantity: r.quantity, totalMinor: toMinor(v.price) * r.quantity }];
  });
  if (!items.length) return { status: "skipped", detail: "cart empty" };

  const email = renderAbandonedCartEmail(
    {
      brand: store.brand,
      customerName: (customer.data as { first_name?: string | null } | null)?.first_name?.trim() || "there",
      items,
      subtotalMinor: items.reduce((s, i) => s + i.totalMinor, 0),
      cartUrl: store.origin ? `${store.origin}${paths.cart()}` : null,
    },
    custom,
  );
  const r = await sendEmail({ tenantId, kind: "abandoned_cart", to: cart.email, ...email, fromName: store.brand.storeName, replyTo: store.storeEmail, idempotencyKey });
  return r.status === "sent" ? { status: "sent" } : r.status === "failed" ? { status: "failed", detail: r.error } : { status: "skipped", detail: r.error ?? r.status };
}
