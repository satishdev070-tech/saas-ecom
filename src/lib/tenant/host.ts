/**
 * Hostname normalisation and classification. Pure functions, edge/node safe.
 * This decides WHICH KIND of host a request is for; it never decides which tenant
 * owns it. Tenant ownership is always resolved server-side from the `domains`
 * table (verified rows only) — see ./resolve.ts.
 */

const MAX_HOSTNAME_LENGTH = 253;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Store slugs double as subdomain labels, so they follow DNS label rules (min 3 chars). */
export const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

/**
 * Subdomain labels that can never be claimed as a store slug. Tenant onboarding must
 * validate slugs against this list too (shared constant).
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www", "app", "admin", "api", "dashboard", "seller", "platform", "auth", "login", "signup",
  "account", "accounts", "billing", "help", "support", "docs", "status", "blog", "mail", "email",
  "smtp", "cdn", "static", "assets", "media", "images", "img", "files", "storage", "edge",
  "internal", "staging", "dev", "test", "preview", "demo", "root", "system", "security", "store",
  "stores", "shop", "checkout", "pay", "payments", "webhooks", "ns1", "ns2",
]);

export function isValidStoreSlug(slug: string): boolean {
  return STORE_SLUG_PATTERN.test(slug) && !RESERVED_SUBDOMAINS.has(slug) && !slug.includes("--");
}

/**
 * Lowercases, strips port and trailing dot, and validates. Returns null for anything
 * that is not a plausible DNS hostname (IP literals, IPv6, empty, overlong, bad labels).
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[")) return null; // IPv6 literal
  const colon = host.indexOf(":");
  if (colon !== -1) {
    const port = host.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port)) return null;
    host = host.slice(0, colon);
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.length > MAX_HOSTNAME_LENGTH) return null;
  if (IPV4.test(host)) return null;
  const labels = host.split(".");
  if (!labels.every((l) => LABEL.test(l))) return null;
  return host;
}

export type HostClassification =
  | { kind: "platform"; host: string }
  | { kind: "store-subdomain"; host: string; slug: string }
  | { kind: "custom-domain"; host: string }
  | { kind: "reserved"; host: string }
  | { kind: "invalid" };

/**
 * `platformAliases` are extra hostnames that serve the platform app (e.g. the Vercel production
 * alias before the real root domain is attached). Exact matches only — never a suffix or wildcard,
 * so an alias can't swallow store hosts. Build the list with `platformHostAliases()`.
 */
export function classifyHost(rawHost: string | null | undefined, rootDomain: string, platformAliases: readonly string[] = []): HostClassification {
  const host = normalizeHost(rawHost);
  const root = normalizeHost(rootDomain);
  if (!host || !root) return { kind: "invalid" };

  if (host === root || host === `www.${root}`) return { kind: "platform", host };
  if (platformAliases.includes(host)) return { kind: "platform", host };

  const suffix = `.${root}`;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    // Only single-level subdomains are stores; a.b.root is never valid.
    if (sub.includes(".")) return { kind: "invalid" };
    if (RESERVED_SUBDOMAINS.has(sub)) return { kind: "reserved", host };
    if (!isValidStoreSlug(sub)) return { kind: "invalid" };
    return { kind: "store-subdomain", host, slug: sub };
  }

  // A bare single label (e.g. "intranet") is never a customer domain.
  if (!host.includes(".")) return { kind: "invalid" };
  return { kind: "custom-domain", host };
}
