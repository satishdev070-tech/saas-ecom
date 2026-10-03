import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Cross-request cache for the storefront's per-tenant lookups (ADR-010 addendum): the hostname
 * directory, the published theme, the store profile and the feature flags. Cache Components stays
 * off, so this uses `unstable_cache` (the Data Cache). Rules:
 * - Only PUBLIC data, never anything read from cookies/headers or a user session (preview drafts
 *   and Live Preview are resolved outside these functions and are never cached).
 * - The cache key always includes the tenant id or the hostname (function arguments are part of
 *   the key), so tenants can't be mixed.
 * - Mutations invalidate with `revalidateStorefront(tenantId)`; out-of-band DB edits (scripts)
 *   show up after `STOREFRONT_CACHE_SECONDS` at most.
 * - Off in development, so `next dev` always reads the database.
 */

export const STOREFRONT_CACHE_SECONDS = 120;
export const TENANT_DIRECTORY_TAG = "tenant-directory";
/** On every cached storefront entry: for platform-wide changes (plans, global feature flags). */
export const ALL_STOREFRONTS_TAG = "storefront-all";
export const storefrontTag = (tenantId: string) => `tenant:${tenantId}:storefront`;

const enabled = process.env.NODE_ENV === "production";

/** Cache `fn(...args)` across requests under `name` + args, tagged for on-demand invalidation. */
export function cachedStorefront<A extends string[], R>(name: string, fn: (...args: A) => Promise<R>, tags: (...args: A) => string[]) {
  if (!enabled) return fn;
  return (...args: A): Promise<R> => unstable_cache(fn, ["sf", name], { tags: [ALL_STOREFRONTS_TAG, ...tags(...args)], revalidate: STOREFRONT_CACHE_SECONDS })(...args);
}

/**
 * Call after any change that affects how a store renders publicly: theme publish/rollback, store
 * profile/SEO/COD settings, domains, tenant status or plan/feature flags. The next request reads
 * fresh data (no stale window). Directory entries are keyed by hostname, so they're invalidated
 * together; that's cheap (one lookup per host on its next request).
 */
export function revalidateStorefront(tenantId: string) {
  revalidateTag(storefrontTag(tenantId), { expire: 0 });
  revalidateTag(TENANT_DIRECTORY_TAG, { expire: 0 });
}

/** Platform-wide change (a plan's features, a global feature flag): every store re-reads once. */
export function revalidateAllStorefronts() {
  revalidateTag(ALL_STOREFRONTS_TAG, { expire: 0 });
}
