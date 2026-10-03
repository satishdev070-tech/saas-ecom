import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tenantDirectory } from "@/lib/tenant/directory";
import { storefrontAvailability } from "@/lib/tenant/context";
import { storeSubdomain } from "@/lib/platform/urls";
import { isIndustry, type IndustrySlug } from "@/features/stores/industries";
import { canPreviewThemes } from "./showcase";

/**
 * Demo slugs whose store exists and is open, so Live Preview is only offered where it works
 * (no dead iframes while a showcase store hasn't been seeded yet).
 * Looks the demo host up in the tenant directory directly: resolveStorefrontTenant() only accepts
 * the host of the CURRENT request, which on the dashboard is the platform host, so it always
 * returned null here and no Live Preview buttons were ever shown.
 */
export async function liveDemoOrigins(slugs: string[]): Promise<Set<string>> {
  const found = await Promise.all(
    slugs.map(async (slug) => {
      const t = await tenantDirectory.findByHost(storeSubdomain(slug));
      return t && storefrontAvailability(t.status) === "open" && canPreviewThemes(t) ? slug : null;
    }),
  );
  return new Set(found.filter((s): s is string => !!s));
}

/** The seller's store category (migration 1800), or null when unset / not migrated yet. */
export async function getStoreIndustry(tenantId: string): Promise<IndustrySlug | null> {
  const { data, error } = await (await createSupabaseServerClient()).from("stores").select("store_categories(slug)").eq("tenant_id", tenantId).maybeSingle();
  if (error || !data) return null;
  const rel = (data as { store_categories: { slug: string } | { slug: string }[] | null }).store_categories;
  const slug = Array.isArray(rel) ? rel[0]?.slug : rel?.slug;
  return slug && isIndustry(slug) ? slug : null;
}
