import "server-only";
import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { cachedStorefront, storefrontTag } from "@/lib/cache/storefront";
import { logger } from "@/lib/observability/logger";
import { activeFestive, parseFestiveSettings, type FestiveCampaign } from "../festive";

class FestiveUnavailable extends Error {}

const lookup = cachedStorefront(
  "festive",
  async (tenantId: string): Promise<FestiveCampaign[]> => {
    const { data, error } = await createSupabasePublicClient().from("stores").select("festive_settings").eq("tenant_id", tenantId).maybeSingle();
    if (error) {
      logger.warn("stores.festive_unavailable", { tenantId, code: error.code });
      throw new FestiveUnavailable(); // not cached; no campaign below
    }
    return parseFestiveSettings(data?.festive_settings);
  },
  (tenantId) => [storefrontTag(tenantId)],
);

/** The festive campaign running today for this store, or null. Never throws. */
export const getActiveFestive = cache(async (tenantId: string): Promise<FestiveCampaign | null> => {
  try {
    return activeFestive(await lookup(tenantId));
  } catch {
    return null;
  }
});
