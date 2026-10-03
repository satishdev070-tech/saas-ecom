import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";
import { logger } from "@/lib/observability/logger";
import { storeSlugCandidates } from "../store-slug";

/**
 * Creates a store for the signed-in user from just a name, picking the first free address.
 * Uses create_tenant (security definer; owner = auth.uid()). Returns null when every candidate
 * is taken or the user hit the store limit; callers then fall back to /onboarding.
 */
export async function createStoreFromName(name: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  for (const slug of storeSlugCandidates(name)) {
    const { data, error } = await supabase.rpc("create_tenant", { p_name: name, p_slug: slug, p_root_domain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN });
    if (!error && data) return data;
    if (error?.code !== "23505") {
      logger.warn("tenants.create_from_name_failed", { code: error?.code });
      return null;
    }
  }
  return null;
}
