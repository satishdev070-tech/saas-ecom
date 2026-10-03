import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { cachedStorefront, TENANT_DIRECTORY_TAG } from "@/lib/cache/storefront";
import type { ResolvedTenant, TenantDirectory, TenantStatus } from "./context";

/**
 * Hostname -> tenant directory (ADR-005). Reads ONLY verified, non-removed `domains` rows
 * with the secret-key client (the lookup must work for anonymous shoppers and for
 * suspended tenants, which RLS would hide). Returns just the fields routing needs.
 * Memoised per request and cached across requests (lib/cache/storefront, invalidated on domain,
 * status and store changes). Misses and errors are NOT cached: they throw out of the cached
 * function, so a newly connected domain works on its very next request.
 */
class HostNotFound extends Error {}

const lookup = cachedStorefront(
  "tenant-directory",
  async (host: string): Promise<ResolvedTenant> => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("domains")
      .select("hostname, tenant_id, tenants!inner(id, slug, status, stores(name))")
      .eq("hostname", host)
      .eq("status", "verified")
      .maybeSingle();
    if (error) {
      logger.error("tenant_directory.lookup_failed", { host, error: error.message });
      throw new HostNotFound();
    }
    if (!data) throw new HostNotFound();

    const { data: primary } = await admin
      .from("domains")
      .select("hostname")
      .eq("tenant_id", data.tenant_id)
      .eq("is_primary", true)
      .eq("status", "verified")
      .maybeSingle();

    const tenant = data.tenants;
    const store = Array.isArray(tenant.stores) ? tenant.stores[0] : tenant.stores;
    return {
      tenantId: data.tenant_id,
      slug: tenant.slug,
      name: store?.name ?? tenant.slug,
      status: tenant.status as TenantStatus,
      host,
      primaryHost: primary?.hostname ?? host,
    };
  },
  (host) => [TENANT_DIRECTORY_TAG, `host:${host}`],
);

const findByHost = cache(async (host: string): Promise<ResolvedTenant | null> => {
  try {
    return await lookup(host);
  } catch (e) {
    if (e instanceof HostNotFound) return null;
    throw e;
  }
});

export const tenantDirectory: TenantDirectory = { findByHost };
