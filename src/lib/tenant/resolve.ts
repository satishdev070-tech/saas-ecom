import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { normalizeHost } from "./host";
import { INTERNAL_HOST_HEADER } from "./routing";
import { tenantDirectory } from "./directory";
import type { ResolvedTenant } from "./context";

/**
 * The effective hostname for this request, as verified by src/proxy.ts. Clients cannot
 * set this header: the proxy deletes any inbound copy before setting its own.
 */
export const getRequestHost = cache(async (): Promise<string | null> => {
  const h = await headers();
  return normalizeHost(h.get(INTERNAL_HOST_HEADER));
});

/**
 * Resolve the storefront tenant for the current request. `routeHost` is the `[host]`
 * segment from the rewritten URL; it must match the proxy-verified host, otherwise the
 * request did not come through the proxy rewrite and is rejected.
 * Memoised per request.
 */
export const resolveStorefrontTenant = cache(async (routeHost: string): Promise<ResolvedTenant | null> => {
  const requestHost = await getRequestHost();
  let decoded: string;
  try {
    decoded = decodeURIComponent(routeHost);
  } catch {
    return null;
  }
  const normalizedRoute = normalizeHost(decoded);
  if (!requestHost || !normalizedRoute || requestHost !== normalizedRoute) return null;
  return tenantDirectory.findByHost(requestHost);
});
