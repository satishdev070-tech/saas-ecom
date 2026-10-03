import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { resolveEntitlements, type Entitlements } from "../flags";

/**
 * Resolved plan features/limits for a tenant, read as the signed-in user (RLS: the caller
 * must be a member of the tenant or platform staff; enforced inside the SQL function).
 * `tenantId` must be server-resolved (membership or requirePlatform), never from input.
 */
export async function getTenantEntitlements(tenantId: string): Promise<Entitlements> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tenant_entitlements", { p_tenant: tenantId });
  if (error) throw mapDbError(error, { tenantId });
  return resolveEntitlements(data);
}

/**
 * Entitlements helper for every feature module: plan limits + resolved feature flags
 * (tenant override > plan feature > flag default).
 *
 *   const ent = await getEntitlements(ctx.tenantId);
 *   if (!ent.isEnabled("blog")) notFound();
 *   if (!canAdd(count, ent.limit("products"))) throw ...
 *
 * Works in every server context (dashboard, anonymous storefront, checkout, cron) because it
 * reads platform configuration with the secret-key client — so `tenantId` MUST already be
 * server-resolved (membership via requireTenant, verified host via resolveStorefrontTenant,
 * requirePlatform, or a job). Read-only; three small indexed queries; memoised per request.
 */
export const getEntitlements = cache(async (tenantId: string): Promise<Entitlements> => {
  const admin = createSupabaseAdminClient();
  const [tenant, flags, overrides] = await Promise.all([
    admin.from("tenants").select("plans(id, code, name, features, limits)").eq("id", tenantId).maybeSingle(),
    admin.from("feature_flags").select("key, default_enabled"),
    admin.from("tenant_feature_flags").select("feature_key, enabled").eq("tenant_id", tenantId),
  ]);
  const error = tenant.error ?? flags.error ?? overrides.error;
  if (error) throw mapDbError(error, { tenantId });
  return resolveEntitlements({
    plan: tenant.data?.plans ?? null,
    defaults: Object.fromEntries((flags.data ?? []).map((f) => [f.key, f.default_enabled])),
    overrides: Object.fromEntries((overrides.data ?? []).map((o) => [o.feature_key, o.enabled])),
  });
});
