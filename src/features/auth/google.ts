import "server-only";
import { publicEnv } from "@/lib/env/public";
import { logger } from "@/lib/observability/logger";

/**
 * True when the Google provider is switched on in Supabase Auth (Authentication → Providers).
 * Reads the public /auth/v1/settings endpoint, cached for 5 minutes, so the "Continue with
 * Google" button only appears once it can actually work.
 */
export async function googleAuthEnabled(): Promise<boolean> {
  const env = publicEnv();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { external?: Record<string, boolean> };
    return j.external?.google === true;
  } catch (err) {
    logger.warn("auth.settings_unavailable", { error: err });
    return false;
  }
}
