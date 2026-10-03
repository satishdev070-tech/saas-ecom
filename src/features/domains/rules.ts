import { z } from "zod";
import { classifyHost, normalizeHost } from "@/lib/tenant/host";

/**
 * Custom-domain rules. Pure (no I/O) so they are unit tested and shared by the
 * seller UI, server actions and the cron job.
 */

/** DNS TXT record proving ownership: `_paliya-verify.<hostname>` = domains.verification_token. */
export const VERIFY_RECORD_PREFIX = "_paliya-verify";

export function verificationRecordName(hostname: string): string {
  return `${VERIFY_RECORD_PREFIX}.${hostname}`;
}

/** Special-use / internal TLDs that can never be a customer's public storefront. */
const BLOCKED_TLDS = new Set(["localhost", "local", "internal", "intranet", "test", "example", "invalid", "onion", "arpa", "home", "lan", "corp", "localdomain"]);
const TLD_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export type CustomDomainCheck = { ok: true; hostname: string } | { ok: false; message: string };

/**
 * Accepts what sellers typically paste ("https://www.brand.in/", "WWW.Brand.in") and
 * returns the normalised hostname, or a user-facing reason it can't be connected.
 * The host must classify as "custom-domain": the platform root, `*.root` store
 * subdomains, reserved names, IP literals and single labels are all refused.
 */
export function checkCustomDomain(raw: string, rootDomain: string, cnameTarget?: string | null, platformAliases: readonly string[] = []): CustomDomainCheck {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.replace(/\/.*$/, ""); // path / trailing slash
  if (!value) return { ok: false, message: "Enter a domain such as www.yourbrand.in" };
  if (/[@?#\s:]/.test(value) || value.startsWith("[")) {
    return { ok: false, message: "Enter just the domain name, without ports, paths or credentials" };
  }
  if (value.startsWith("*.")) return { ok: false, message: "Wildcard domains aren't supported. Enter a specific domain such as www.yourbrand.in" };

  const host = normalizeHost(value);
  if (!host) return { ok: false, message: "That doesn't look like a valid domain name" };

  const kind = classifyHost(host, rootDomain, platformAliases).kind;
  if (kind === "platform" || kind === "store-subdomain" || kind === "reserved") {
    return { ok: false, message: "Platform addresses can't be added as a custom domain" };
  }
  if (kind !== "custom-domain") return { ok: false, message: "That doesn't look like a valid domain name" };

  const target = cnameTarget ? normalizeHost(cnameTarget) : null;
  if (target && (host === target || host.endsWith(`.${target}`))) {
    return { ok: false, message: "Platform addresses can't be added as a custom domain" };
  }

  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (BLOCKED_TLDS.has(tld) || !TLD_PATTERN.test(tld)) return { ok: false, message: "Use a public domain name you own" };
  return { ok: true, hostname: host };
}

export const addDomainSchema = z.object({
  hostname: z.string({ error: "Enter a domain" }).trim().min(3, "Enter a domain such as www.yourbrand.in").max(260),
});

export const domainIdSchema = z.object({ domainId: z.uuid() });

/** Domain row status as stored in public.domains. */
export type DomainStatus = "pending" | "verified" | "failed" | "removed";
export type SslStatus = "pending" | "active" | "failed" | "not_applicable";

/** After this long without a successful check a pending domain is shown as failed. */
export const PENDING_GRACE_HOURS = 72;
/** Unverified domains older than this are released (status removed) so hostnames can't be squatted. */
export const UNVERIFIED_EXPIRY_DAYS = 30;
/** Failed domains are re-checked by cron at most this often (sellers can always "Verify now"). */
export const FAILED_RECHECK_HOURS = 6;

/** Next status for an unverified domain after a failed DNS check. */
export function statusAfterFailedCheck(createdAt: Date, now: Date = new Date()): "pending" | "failed" | "removed" {
  const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  if (ageHours >= UNVERIFIED_EXPIRY_DAYS * 24) return "removed";
  if (ageHours >= PENDING_GRACE_HOURS) return "failed";
  return "pending";
}

/** Plan limit check. `limit` null/undefined = unlimited; the count excludes removed domains. */
export function canAddAnotherDomain(activeCustomDomains: number, limit: number | null | undefined): boolean {
  if (limit === null || limit === undefined) return true;
  return activeCustomDomains < limit;
}
