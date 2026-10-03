import "server-only";
import { getRequestHost } from "@/lib/tenant/resolve";
import { tenantDirectory } from "@/lib/tenant/directory";
import { storefrontAvailability, type ResolvedTenant } from "@/lib/tenant/context";
import { AppError } from "@/lib/errors";

/**
 * Storefront tenant for server actions and route handlers, which have no `[host]` param.
 * Resolved ONLY from the proxy-verified host header (clients cannot set it), never from input.
 * Throws TENANT_UNAVAILABLE for unknown, suspended or cancelled stores.
 */
export async function requireStoreTenant(): Promise<ResolvedTenant> {
  const host = await getRequestHost();
  if (!host) throw new AppError("TENANT_UNAVAILABLE");
  const tenant = await tenantDirectory.findByHost(host);
  if (!tenant || storefrontAvailability(tenant.status) !== "open") throw new AppError("TENANT_UNAVAILABLE", { context: { host } });
  return tenant;
}

/** Same as requireStoreTenant but returns null instead of throwing (for GET route handlers). */
export async function findStoreTenant(): Promise<ResolvedTenant | null> {
  try {
    return await requireStoreTenant();
  } catch {
    return null;
  }
}
