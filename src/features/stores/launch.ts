import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cachedStorefront, storefrontTag } from "@/lib/cache/storefront";
import { logger } from "@/lib/observability/logger";
import { PREVIEW_COOKIE } from "@/features/theme/preview";
import { verifyPreviewToken } from "@/features/theme/server/preview";

/**
 * Store launch status (migration 2400). Onboarding creates stores as `draft`: visitors see a
 * "coming soon" page until the owner publishes. Every read FAILS OPEN to `live`, so a missing
 * column (migration not applied yet) or a transient error never takes an existing store offline.
 */
export type LaunchStatus = "draft" | "live";

export function parseLaunchStatus(value: unknown): LaunchStatus {
  return value === "draft" ? "draft" : "live";
}

class LaunchLookupFailed extends Error {}

const lookup = cachedStorefront(
  "launch-status",
  async (tenantId: string): Promise<LaunchStatus> => {
    // Anon client + RLS (stores_public_select): no secret key needed for a public flag.
    const { data, error } = await createSupabasePublicClient().from("stores").select("launch_status").eq("tenant_id", tenantId).maybeSingle();
    if (error) {
      logger.warn("stores.launch_status_unavailable", { tenantId, code: error.code, error: error.message });
      throw new LaunchLookupFailed(); // not cached; treated as live below
    }
    return parseLaunchStatus(data?.launch_status);
  },
  (tenantId) => [storefrontTag(tenantId)],
);

/** Storefront: is this store still a private draft? Memoised per request. */
export const getLaunchStatus = cache(async (tenantId: string): Promise<LaunchStatus> => {
  try {
    return await lookup(tenantId);
  } catch {
    return "live";
  }
});

/**
 * The store owner's draft preview: the signed, tenant-bound preview cookie the dashboard installs
 * via /preview?token=… (features/theme/server/preview). Lets the owner see a draft store.
 */
export async function hasOwnerPreview(tenantId: string): Promise<boolean> {
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
  return !!token && !!verifyPreviewToken(token, tenantId);
}

/** True when visitors must see the coming-soon page instead of the store. */
export async function isHiddenDraft(tenantId: string): Promise<boolean> {
  return (await getLaunchStatus(tenantId)) === "draft" && !(await hasOwnerPreview(tenantId));
}

/** Dashboard read (member session, uncached) so Publish reflects immediately. Fails open to live. */
export async function getLaunchStatusForMember(tenantId: string): Promise<LaunchStatus> {
  const { data, error } = await (await createSupabaseServerClient()).from("stores").select("launch_status").eq("tenant_id", tenantId).maybeSingle();
  return error ? "live" : parseLaunchStatus(data?.launch_status);
}
