import { publicEnv } from "@/lib/env/public";
import { platformOrigin } from "@/lib/platform/urls";

/**
 * Environment-derived values for the marketing site that must never throw: the platform
 * build is expected to succeed without env (see IMPLEMENTATION_STATUS), and the page is
 * statically prerendered, so missing config degrades to documented examples instead.
 */

/** Used for metadataBase/JSON-LD when env is not configured (Next's own default). */
export const FALLBACK_ORIGIN = "http://localhost:3000";
/** Example root domain used in docs/tests until the real one is chosen (ADR-021). */
export const FALLBACK_ROOT_DOMAIN = "paliya.store";

export function siteOrigin(): string {
  try {
    return platformOrigin();
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/** Root domain that store subdomains live under, for copy such as "yourbrand.paliya.store". */
export function storeRootDomain(): string {
  try {
    return publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN;
  } catch {
    return FALLBACK_ROOT_DOMAIN;
  }
}
