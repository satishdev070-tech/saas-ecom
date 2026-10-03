import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { publicEnv } from "@/lib/env/public";
import { cachedStorefront, TENANT_DIRECTORY_TAG } from "@/lib/cache/storefront";
import type { ResolvedTenant, TenantDirectory, TenantStatus } from "./context";

/**
 * Hostname -> tenant directory (ADR-005). Reads ONLY verified, non-removed `domains` rows
 * with the secret-key client (the lookup must work for anonymous shoppers and for
 * suspended tenants, which RLS would hide). Returns just the fields routing needs.
 * Memoised per request and cached across requests (lib/cache/storefront, invalidated on domain,
 * status and store changes). Misses and errors are NOT cached: they throw out of the cached
 * function, so a newly connected domain works on its very next request.
 *
 * A missing row is a 404 (`null`). A failed query (bad key, network, schema drift) is NOT: it
 * throws `TenantDirectoryError` so the request fails as a 5xx through the error boundary and the
 * cause is logged, instead of every store silently rendering "Page not found".
 */
class HostNotFound extends Error {}

export class TenantDirectoryError extends Error {
  constructor(public readonly host: string) {
    super("Tenant directory lookup failed");
    this.name = "TenantDirectoryError";
  }
}

type DirectoryEntry = ResolvedTenant & { custom: boolean };

const lookup = cachedStorefront(
  "tenant-directory-v2",
  async (host: string): Promise<DirectoryEntry> => {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("domains")
      .select("hostname, type, tenant_id, tenants!inner(id, slug, status, stores(name))")
      .eq("hostname", host)
      .eq("status", "verified")
      .maybeSingle();
    if (error) {
      // PostgREST error fields only (never the key or request headers).
      logger.error("tenant_directory.lookup_failed", { host, code: error.code, error: error.message, details: error.details, hint: error.hint });
      throw new TenantDirectoryError(host);
    }
    if (!data) throw new HostNotFound();

    const { data: primary, error: primaryError } = await admin
      .from("domains")
      .select("hostname")
      .eq("tenant_id", data.tenant_id)
      .eq("is_primary", true)
      .eq("status", "verified")
      .maybeSingle();
    if (primaryError) {
      logger.error("tenant_directory.primary_lookup_failed", { host, code: primaryError.code, error: primaryError.message });
      throw new TenantDirectoryError(host);
    }

    const tenant = data.tenants;
    const store = Array.isArray(tenant.stores) ? tenant.stores[0] : tenant.stores;
    return {
      tenantId: data.tenant_id,
      slug: tenant.slug,
      name: store?.name ?? tenant.slug,
      status: tenant.status as TenantStatus,
      host,
      primaryHost: primary?.hostname ?? host,
      custom: data.type === "custom",
    };
  },
  (host) => [TENANT_DIRECTORY_TAG, `host:${host}`],
);

/**
 * The www / apex partner of a custom domain ("www.brand.in" <-> "brand.in"), or null for platform
 * hosts. Sellers often connect one and point both at us (or the registrar forwards one to the
 * other); the partner then serves the same store, with canonical URLs on the primary domain.
 */
export function companionCustomHost(host: string, rootDomain: string): string | null {
  if (host === rootDomain || host.endsWith(`.${rootDomain}`) || host === "localhost" || host.endsWith(".localhost")) return null;
  if (host.startsWith("www.")) {
    const apex = host.slice(4);
    return apex.includes(".") ? apex : null;
  }
  return `www.${host}`;
}

async function find(host: string): Promise<DirectoryEntry | null> {
  try {
    return await lookup(host);
  } catch (e) {
    if (e instanceof HostNotFound) return null;
    throw e;
  }
}

const findByHost = cache(async (host: string): Promise<ResolvedTenant | null> => {
  const strip = (e: DirectoryEntry): ResolvedTenant => ({ tenantId: e.tenantId, slug: e.slug, name: e.name, status: e.status, host: e.host, primaryHost: e.primaryHost });
  const exact = await find(host);
  if (exact) return strip(exact);
  const companion = companionCustomHost(host, publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN);
  if (!companion) return null;
  // Only a VERIFIED custom domain lends its store to its www/apex partner.
  const partner = await find(companion);
  return partner?.custom ? { ...strip(partner), host } : null;
});

/**
 * For a host that isn't routable: is a store owner in the middle of connecting it (or its
 * www/apex partner)? Lets the storefront explain "verification pending" instead of a bare 404.
 * Reveals only the state, never the store.
 */
export async function pendingDomainState(host: string): Promise<"pending" | "failed" | null> {
  const companion = companionCustomHost(host, publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN);
  const { data, error } = await createSupabaseAdminClient()
    .from("domains")
    .select("status")
    .in("hostname", companion ? [host, companion] : [host])
    .in("status", ["pending", "failed"])
    .limit(1);
  if (error || !data?.length) return null;
  return data[0]!.status === "failed" ? "failed" : "pending";
}

export const tenantDirectory: TenantDirectory = { findByHost };
