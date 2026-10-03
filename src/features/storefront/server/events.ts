import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

type StoreEvent = { tenantId: string; name: "page_view" | "product_view" | "search"; path: string; productId?: string; metadata?: Record<string, string | number | boolean> };

/**
 * Records a storefront analytics event. Call inside `after()` so it never delays the
 * response. Failures are logged and swallowed.
 */
export async function trackStoreEvent(e: StoreEvent): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient()
      .from("analytics_events")
      .insert({ tenant_id: e.tenantId, event_name: e.name, path: e.path.slice(0, 300), product_id: e.productId ?? null, metadata: e.metadata ?? {} });
    if (error) throw error;
  } catch (err) {
    logger.warn("storefront.event_failed", { name: e.name, error: err });
  }
}
