import "server-only";
import { cache } from "react";
import { activeIntegration } from "@/features/integrations/server/store";
import type { TrackingConfig } from "../components/tracking-tags";

/** Enabled tags of a store (tenant from the verified host). Only public IDs; tracking has no secrets. */
export const getTrackingConfig = cache(async (tenantId: string): Promise<TrackingConfig | null> => {
  const [ga4, ads, pixel] = await Promise.all([activeIntegration(tenantId, "ga4"), activeIntegration(tenantId, "google_ads"), activeIntegration(tenantId, "meta_pixel")]);
  const cfg: TrackingConfig = {
    ga4: ga4?.public.measurement_id ?? null,
    ads: ads?.public.ads_id && ads.public.purchase_label ? { id: ads.public.ads_id, label: ads.public.purchase_label } : null,
    pixel: pixel?.public.pixel_id ?? null,
  };
  return cfg.ga4 || cfg.ads || cfg.pixel ? cfg : null;
});
