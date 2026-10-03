import "server-only";
import { cache } from "react";
import { logger } from "@/lib/observability/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { toMinor } from "@/lib/money";
import { countCartUnits, resolveCart, type CartRecord } from "./service";
import { loadCartLines, type CartLine } from "./lines";

/**
 * Units in the shopper's cart for the storefront header. `tenantId` must be the tenant the
 * layout resolved from the verified host. Never throws (the header must always render).
 */
export const getCartCount = cache(async (tenantId: string): Promise<number> => {
  try {
    const cart = await resolveCart(tenantId);
    return cart ? await countCartUnits(tenantId, cart.id) : 0;
  } catch (err) {
    logger.warn("cart.count_failed", { tenantId, error: err });
    return 0;
  }
});

export type CartView = { cart: CartRecord | null; lines: CartLine[]; saved: CartLine[] };

/** Cart with current prices and stock. Read-only (safe in Server Components). */
export const getCartView = cache(async (tenantId: string): Promise<CartView> => {
  const cart = await resolveCart(tenantId);
  if (!cart) return { cart: null, lines: [], saved: [] };
  const all = await loadCartLines(tenantId, cart.id);
  return { cart, lines: all.filter((l) => !l.savedForLater), saved: all.filter((l) => l.savedForLater) };
});

/**
 * Lowest order value that unlocks a free, unrestricted shipping rate (paise), or null when the
 * store has none. Public read (shipping_rates_public RLS). Never throws.
 */
export const getFreeShippingThreshold = cache(async (tenantId: string): Promise<number | null> => {
  try {
    const { data, error } = await createSupabasePublicClient()
      .from("shipping_rates")
      .select("min_subtotal")
      .eq("tenant_id", tenantId)
      .eq("price", 0)
      .is("max_subtotal", null)
      .order("min_subtotal", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const min = toMinor(data.min_subtotal ?? 0);
    return min > 0 ? min : null;
  } catch (err) {
    logger.warn("cart.free_shipping_lookup_failed", { tenantId, error: err });
    return null;
  }
});
