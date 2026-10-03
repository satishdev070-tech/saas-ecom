import { classifyHost, type HostClassification } from "./host";

/**
 * Internal route prefix that storefront hosts are rewritten into.
 * `acme.paliya.store/products/kurta` -> `/store/acme.paliya.store/products/kurta`.
 * Never reachable directly from a platform host (see decideRoute).
 */
export const STORE_ROUTE_PREFIX = "/store";

/** Request header carrying the proxy-verified effective hostname to server code. */
export const INTERNAL_HOST_HEADER = "x-paliya-host";
/** Request header carrying a per-request correlation id. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Headers a client must never be able to inject; the proxy strips them before anything else. */
export const INTERNAL_REQUEST_HEADERS = [INTERNAL_HOST_HEADER, "x-sf-theme-preview"] as const;
/** Marketplace theme key for a demo-store Live Preview (set only by the proxy). */
export const THEME_PREVIEW_HEADER = "x-sf-theme-preview";

/** Platform-only path prefixes. They 404 on storefront hosts so seller auth cookies stay on the platform origin. */
const PLATFORM_ONLY_PREFIXES = ["/dashboard", "/admin", "/login", "/signup", "/onboarding", "/forgot-password", "/reset-password", "/auth", "/invite", "/seller"];

/** Paths served as-is on every host (framework assets and API handlers that read the host header themselves). */
const PASSTHROUGH_PREFIXES = ["/api/", "/_next/"];

export type RouteDecision =
  | { action: "next"; classification: HostClassification }
  | { action: "rewrite"; pathname: string; classification: HostClassification }
  | { action: "not-found"; classification: HostClassification };

function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

export function decideRoute(host: string | null, pathname: string, rootDomain: string, platformAliases: readonly string[] = []): RouteDecision {
  const classification = classifyHost(host, rootDomain, platformAliases);

  switch (classification.kind) {
    case "invalid":
    case "reserved":
      return { action: "not-found", classification };

    case "platform":
      // The internal storefront namespace is never addressable directly.
      if (hasPrefix(pathname, STORE_ROUTE_PREFIX)) return { action: "not-found", classification };
      return { action: "next", classification };

    case "store-subdomain":
    case "custom-domain": {
      if (PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))) return { action: "next", classification };
      if (PLATFORM_ONLY_PREFIXES.some((p) => hasPrefix(pathname, p))) return { action: "not-found", classification };
      const suffix = pathname === "/" ? "" : pathname;
      return {
        action: "rewrite",
        pathname: `${STORE_ROUTE_PREFIX}/${classification.host}${suffix}`,
        classification,
      };
    }
  }
}
