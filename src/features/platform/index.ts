/**
 * Public surface of the platform feature for other features (server-side use).
 * Keep this small: other modules must not reach into ./server/* directly.
 *
 * - getEntitlements(tenantId): plan limits + resolved feature flags; works in any server
 *   context (tenantId must be server-resolved). Use this for limit/feature enforcement.
 * - getTenantEntitlements(tenantId): same result read through RLS as the signed-in member.
 */
export { getEntitlements, getTenantEntitlements } from "./server/entitlements";
export { resolveEntitlements, resolveFeature, type Entitlements, type ResolvedFeature } from "./flags";
