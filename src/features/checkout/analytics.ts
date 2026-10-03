import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/crypto";
import { toDecimalString } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import type { Json } from "@/lib/supabase/database.types";

export type CommerceEvent = "add_to_cart" | "begin_checkout" | "purchase";

/**
 * Server-side analytics (analytics_events has no shopper policies). Tenant id comes from the
 * verified host / order row, never from the browser. Never throws.
 */
export async function trackCommerceEvent(
  tenantId: string,
  event: CommerceEvent,
  data: { cartId?: string | null; customerId?: string | null; productId?: string | null; orderId?: string | null; valueMinor?: number | null; path?: string; metadata?: Record<string, Json> } = {},
): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient()
      .from("analytics_events")
      .insert({
        tenant_id: tenantId,
        event_name: event,
        // pseudonymous session key: never the raw cart id
        session_id: data.cartId ? sha256Hex(`cart:${data.cartId}`).slice(0, 32) : null,
        customer_id: data.customerId ?? null,
        product_id: data.productId ?? null,
        order_id: data.orderId ?? null,
        value: data.valueMinor == null ? null : Number(toDecimalString(data.valueMinor)),
        path: data.path ?? null,
        metadata: (data.metadata ?? {}) as Json,
      });
    if (error) throw error;
  } catch (err) {
    logger.warn("analytics.insert_failed", { tenantId, event, error: err });
  }
}
