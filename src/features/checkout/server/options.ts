import "server-only";
import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { cachedStorefront, storefrontTag } from "@/lib/cache/storefront";
import { logger } from "@/lib/observability/logger";
import { getPublicPlatformConfig } from "@/features/platform/server/public-config";
import { DEFAULT_CHECKOUT_OPTIONS, parseCheckoutOptions, type CheckoutOptions } from "../options";

class CheckoutOptionsUnavailable extends Error {}

const lookup = cachedStorefront(
  "checkout-options",
  async (tenantId: string): Promise<CheckoutOptions> => {
    // Anon client + RLS (stores_public_select): checkout options aren't secret.
    const { data, error } = await createSupabasePublicClient().from("stores").select("checkout_settings").eq("tenant_id", tenantId).maybeSingle();
    if (error) {
      logger.warn("stores.checkout_settings_unavailable", { tenantId, code: error.code });
      throw new CheckoutOptionsUnavailable(); // not cached; defaults below
    }
    return parseCheckoutOptions(data?.checkout_settings);
  },
  (tenantId) => [storefrontTag(tenantId)],
);

/**
 * The store's checkout options, with the platform-wide location switch applied. Fails open to
 * today's behaviour (migration not applied yet, transient error).
 */
export const getCheckoutOptions = cache(async (tenantId: string): Promise<CheckoutOptions> => {
  let options = DEFAULT_CHECKOUT_OPTIONS;
  try {
    options = await lookup(tenantId);
  } catch {
    // defaults
  }
  const platform = await getPublicPlatformConfig();
  return { ...options, locationAutofill: options.locationAutofill && platform.locationAutofill };
});
