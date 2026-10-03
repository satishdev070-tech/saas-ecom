import "server-only";
import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/observability/logger";
import { FALLBACK_PLANS, normalizePlans, type MarketingPlan, type PlanRow } from "../plans";

/** Active plans for the marketing site (anon + RLS). Falls back to the static list on error. */
export const getMarketingPlans = cache(async (): Promise<MarketingPlan[]> => {
  try {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("plans")
      .select("code, name, description, price_monthly, price_yearly, currency, limits, features, trial_days, sort_order, active")
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    const plans = normalizePlans((data ?? []) as PlanRow[]);
    return plans.length ? plans : FALLBACK_PLANS;
  } catch (err) {
    logger.warn("marketing.plans_fallback", { err: err instanceof Error ? err.message : "unknown" });
    return FALLBACK_PLANS;
  }
});
