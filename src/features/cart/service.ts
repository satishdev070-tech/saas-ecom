import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { getStoreCustomer } from "@/features/customer-account/session";
import { readCartIdFromCookie, writeCartCookie } from "./token";
import { loadVariantDetails, MAX_CART_LINES, MAX_LINE_QUANTITY } from "./lines";

/**
 * Cart persistence (ADR-023). Carts have no RLS policies for shoppers: every read/write goes
 * through here with the admin client, ALWAYS filtered by the host-resolved tenant id AND a
 * cart id taken from the verified cookie (or the signed-in customer's own active cart).
 */
export type CartRecord = {
  id: string;
  tenantId: string;
  customerId: string | null;
  discountCode: string | null;
  note: string | null;
  email: string | null;
};

const CART_COLUMNS = "id, tenant_id, customer_id, discount_code, note, email";

function toRecord(r: { id: string; tenant_id: string; customer_id: string | null; discount_code: string | null; note: string | null; email: string | null }): CartRecord {
  return { id: r.id, tenantId: r.tenant_id, customerId: r.customer_id, discountCode: r.discount_code, note: r.note, email: r.email };
}

async function loadActiveCart(tenantId: string, cartId: string): Promise<CartRecord | null> {
  const { data } = await createSupabaseAdminClient()
    .from("carts")
    .select(CART_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", cartId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? toRecord(data) : null;
}

async function latestCustomerCart(tenantId: string, customerId: string): Promise<CartRecord | null> {
  const { data } = await createSupabaseAdminClient()
    .from("carts")
    .select(CART_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRecord(data) : null;
}

/**
 * The shopper's current cart, or null. A cookie cart that belongs to a DIFFERENT customer
 * (e.g. a shared device after someone else signed out) is ignored.
 */
export async function resolveCart(tenantId: string): Promise<CartRecord | null> {
  const customer = await getStoreCustomer(tenantId);
  const cookieCartId = await readCartIdFromCookie(tenantId);
  if (cookieCartId) {
    const cart = await loadActiveCart(tenantId, cookieCartId);
    if (cart && (cart.customerId === null || cart.customerId === customer?.id)) return cart;
  }
  return customer ? latestCustomerCart(tenantId, customer.id) : null;
}

/** Server Action / Route Handler only (writes the cookie). */
export async function getOrCreateCart(tenantId: string): Promise<CartRecord> {
  const existing = await resolveCart(tenantId);
  if (existing) {
    await writeCartCookie(tenantId, existing.id);
    return existing;
  }
  const customer = await getStoreCustomer(tenantId);
  const { data, error } = await createSupabaseAdminClient()
    .from("carts")
    .insert({ tenant_id: tenantId, customer_id: customer?.id ?? null, email: customer?.email ?? null })
    .select(CART_COLUMNS)
    .single();
  if (error || !data) throw new AppError("INTERNAL", { context: { db: error?.message } });
  await writeCartCookie(tenantId, data.id);
  return toRecord(data);
}

export async function requireCart(tenantId: string): Promise<CartRecord> {
  const cart = await resolveCart(tenantId);
  if (!cart) throw new AppError("NOT_FOUND", { message: "Your cart is empty." });
  return cart;
}

async function touch(tenantId: string, cartId: string) {
  // Keeps the cart alive and bumps updated_at (used for "latest cart" and abandoned-cart jobs).
  await createSupabaseAdminClient()
    .from("carts")
    .update({ expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", cartId);
}

export type AddResult = {
  cartId: string;
  quantity: number;
  limited: boolean;
  /** For browser analytics (public catalogue data only). */
  item: { productId: string; productTitle: string; variantTitle: string | null; sku: string | null; unitPrice: number };
};

/** Adds a purchasable variant of THIS tenant; clamps to available stock and the per-line max. */
export async function addItem(tenantId: string, variantId: string, quantity: number): Promise<AddResult> {
  const details = (await loadVariantDetails(tenantId, [variantId])).get(variantId);
  if (!details || !details.purchasable) throw new AppError("NOT_FOUND", { message: "This item is no longer available." });
  if (!details.inStock || details.maxQuantity < 1) throw new AppError("CONFLICT", { message: "Sorry, this size is out of stock." });

  const cart = await getOrCreateCart(tenantId);
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("cart_items")
    .select("id, quantity, saved_for_later")
    .eq("tenant_id", tenantId)
    .eq("cart_id", cart.id)
    .eq("variant_id", variantId)
    .maybeSingle();

  if (!existing) {
    const { count } = await admin.from("cart_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("cart_id", cart.id);
    if ((count ?? 0) >= MAX_CART_LINES) throw new AppError("VALIDATION", { message: "Your cart is full. Remove an item to add another." });
  }

  const current = existing && !existing.saved_for_later ? existing.quantity : 0;
  const wanted = current + quantity;
  const next = Math.min(wanted, details.maxQuantity, MAX_LINE_QUANTITY);
  if (next < 1) throw new AppError("CONFLICT", { message: "Sorry, this size is out of stock." });

  const { error } = await admin
    .from("cart_items")
    .upsert({ tenant_id: tenantId, cart_id: cart.id, variant_id: variantId, quantity: next, saved_for_later: false }, { onConflict: "cart_id,variant_id" });
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  await touch(tenantId, cart.id);
  return {
    cartId: cart.id,
    quantity: next,
    limited: next < wanted,
    item: { productId: details.productId, productTitle: details.productTitle, variantTitle: details.variantTitle, sku: details.sku, unitPrice: details.unitPrice },
  };
}

async function requireItem(tenantId: string, cartId: string, itemId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("cart_items")
    .select("id, variant_id, quantity, saved_for_later")
    .eq("tenant_id", tenantId)
    .eq("cart_id", cartId)
    .eq("id", itemId)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", { message: "That item is no longer in your cart." });
  return data;
}

export async function updateItemQuantity(tenantId: string, itemId: string, quantity: number): Promise<{ quantity: number; limited: boolean }> {
  const cart = await requireCart(tenantId);
  const item = await requireItem(tenantId, cart.id, itemId);
  const admin = createSupabaseAdminClient();
  if (quantity <= 0) {
    await admin.from("cart_items").delete().eq("tenant_id", tenantId).eq("cart_id", cart.id).eq("id", item.id);
    return { quantity: 0, limited: false };
  }
  const details = (await loadVariantDetails(tenantId, [item.variant_id])).get(item.variant_id);
  const max = details?.maxQuantity ?? 0;
  if (max < 1) throw new AppError("CONFLICT", { message: "This item is out of stock. Remove it or save it for later." });
  const next = Math.min(quantity, max, MAX_LINE_QUANTITY);
  const { error } = await admin.from("cart_items").update({ quantity: next }).eq("tenant_id", tenantId).eq("cart_id", cart.id).eq("id", item.id);
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  await touch(tenantId, cart.id);
  return { quantity: next, limited: next < quantity };
}

export async function removeItem(tenantId: string, itemId: string): Promise<void> {
  const cart = await requireCart(tenantId);
  await createSupabaseAdminClient().from("cart_items").delete().eq("tenant_id", tenantId).eq("cart_id", cart.id).eq("id", itemId);
}

export async function setSavedForLater(tenantId: string, itemId: string, saved: boolean): Promise<void> {
  const cart = await requireCart(tenantId);
  const item = await requireItem(tenantId, cart.id, itemId);
  const { error } = await createSupabaseAdminClient()
    .from("cart_items")
    .update({ saved_for_later: saved })
    .eq("tenant_id", tenantId)
    .eq("cart_id", cart.id)
    .eq("id", item.id);
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
}

export async function updateCart(tenantId: string, patch: { discount_code?: string | null; note?: string | null; email?: string | null }): Promise<CartRecord> {
  const cart = await getOrCreateCart(tenantId);
  const { data, error } = await createSupabaseAdminClient()
    .from("carts")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", cart.id)
    .select(CART_COLUMNS)
    .single();
  if (error || !data) throw new AppError("INTERNAL", { context: { db: error?.message } });
  return toRecord(data);
}

/** Number of units in the active (not saved-for-later) part of the cart. */
export async function countCartUnits(tenantId: string, cartId: string): Promise<number> {
  const { data } = await createSupabaseAdminClient()
    .from("cart_items")
    .select("quantity")
    .eq("tenant_id", tenantId)
    .eq("cart_id", cartId)
    .eq("saved_for_later", false);
  return (data ?? []).reduce((a, r) => a + r.quantity, 0);
}

/**
 * After sign-in: fold the guest cookie cart into the customer's cart (quantities summed and
 * capped), or adopt it when the customer has none. Server Action / Route Handler only.
 */
export async function mergeGuestCartIntoCustomer(tenantId: string, customerId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  try {
    const cookieCartId = await readCartIdFromCookie(tenantId);
    const guest = cookieCartId ? await loadActiveCart(tenantId, cookieCartId) : null;
    const own = await latestCustomerCart(tenantId, customerId);

    if (!guest || guest.customerId === customerId) {
      if (own) await writeCartCookie(tenantId, own.id);
      return;
    }
    if (guest.customerId !== null) {
      // Someone else's cart on this device: never merge it.
      if (own) await writeCartCookie(tenantId, own.id);
      return;
    }
    if (!own) {
      await admin.from("carts").update({ customer_id: customerId }).eq("tenant_id", tenantId).eq("id", guest.id).is("customer_id", null);
      await writeCartCookie(tenantId, guest.id);
      return;
    }

    const [{ data: guestItems }, { data: ownItems }] = await Promise.all([
      admin.from("cart_items").select("variant_id, quantity, saved_for_later").eq("tenant_id", tenantId).eq("cart_id", guest.id),
      admin.from("cart_items").select("variant_id, quantity, saved_for_later").eq("tenant_id", tenantId).eq("cart_id", own.id),
    ]);
    const merged = new Map((ownItems ?? []).map((i) => [i.variant_id, { ...i }]));
    for (const g of guestItems ?? []) {
      const o = merged.get(g.variant_id);
      if (o) {
        o.quantity = Math.min(MAX_LINE_QUANTITY, (o.saved_for_later ? 0 : o.quantity) + (g.saved_for_later ? 0 : g.quantity)) || o.quantity;
        o.saved_for_later = o.saved_for_later && g.saved_for_later;
      } else if (merged.size < MAX_CART_LINES) {
        merged.set(g.variant_id, { ...g });
      }
    }
    if (merged.size > 0) {
      await admin.from("cart_items").upsert(
        [...merged.values()].map((i) => ({ tenant_id: tenantId, cart_id: own.id, variant_id: i.variant_id, quantity: i.quantity, saved_for_later: i.saved_for_later })),
        { onConflict: "cart_id,variant_id" },
      );
    }
    const ownPatch: { discount_code?: string; note?: string } = {};
    if (!own.discountCode && guest.discountCode) ownPatch.discount_code = guest.discountCode;
    if (!own.note && guest.note) ownPatch.note = guest.note;
    if (Object.keys(ownPatch).length) await admin.from("carts").update(ownPatch).eq("tenant_id", tenantId).eq("id", own.id);
    await admin.from("carts").update({ status: "abandoned" }).eq("tenant_id", tenantId).eq("id", guest.id);
    await admin.from("cart_items").delete().eq("tenant_id", tenantId).eq("cart_id", guest.id);
    await writeCartCookie(tenantId, own.id);
  } catch (err) {
    // A failed merge must never block sign-in.
    logger.error("cart.merge_failed", { tenantId, error: err });
  }
}
