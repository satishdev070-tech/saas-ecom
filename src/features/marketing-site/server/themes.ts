import "server-only";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { liveDemoOrigins } from "@/features/theme/marketplace/server";
import { livePreviewUrl } from "@/features/theme/marketplace/live-preview";
import { logger } from "@/lib/observability/logger";
import type { MarketplaceTheme } from "@/features/theme/marketplace/catalog";

/**
 * Live Preview URLs for public theme cards: the theme rendered on its demo (showcase) store via
 * ?sf_theme=<key>. Applied in memory only for showcase tenants, so previews never write to any
 * store. Demo stores that aren't live are skipped, and any lookup failure just hides the button.
 */
export async function livePreviewUrls(themes: readonly MarketplaceTheme[]): Promise<Map<string, string>> {
  const demos = [...new Set(themes.flatMap((t) => (t.demo ? [t.demo] : [])))];
  let live = new Set<string>();
  try {
    live = await liveDemoOrigins(demos);
  } catch (error) {
    logger.warn("marketing.theme_demos_unavailable", { error: error instanceof Error ? error.message : "unknown" });
  }
  const out = new Map<string, string>();
  for (const t of themes) {
    if (t.demo && live.has(t.demo)) {
      try {
        out.set(t.key, livePreviewUrl(storeOrigin(storeSubdomain(t.demo)), t.key));
      } catch {
        // storeSubdomain needs the platform env; without it there is simply no preview.
      }
    }
  }
  return out;
}
