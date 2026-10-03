/**
 * Tenant context contracts shared by storefront, dashboard and platform code.
 */

export const TENANT_STATUSES = ["trial", "active", "suspended", "cancelled"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** A tenant as resolved from a verified hostname. Produced server-side only. */
export type ResolvedTenant = {
  tenantId: string;
  slug: string;
  name: string;
  status: TenantStatus;
  /** The hostname the request arrived on (already verified to belong to this tenant). */
  host: string;
  /** Canonical hostname for SEO/redirects (the tenant's primary domain). */
  primaryHost: string;
};

export type StorefrontAvailability = "open" | "suspended" | "unavailable";

/**
 * What the storefront should render for a tenant status.
 * - trial/active: normal storefront
 * - suspended: controlled "store temporarily unavailable" page (HTTP 503, noindex)
 * - cancelled: treated like an unknown host (404) so nothing leaks
 */
export function storefrontAvailability(status: TenantStatus): StorefrontAvailability {
  switch (status) {
    case "trial":
    case "active":
      return "open";
    case "suspended":
      return "suspended";
    case "cancelled":
      return "unavailable";
  }
}

/**
 * Data access port for hostname -> tenant lookup. Implemented against the `domains`
 * table in Phase 2 (verified rows only, both platform subdomains and custom domains).
 */
export interface TenantDirectory {
  findByHost(host: string): Promise<ResolvedTenant | null>;
}
