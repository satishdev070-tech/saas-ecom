import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { addProjectDomain, companionHostname, inspectProjectDomain, removeProjectDomain, VercelApiError, type DnsRecord, type VercelConfig, type VercelDomainState } from "@/lib/vercel/domains";
import { verificationRecordName } from "../rules";
import { vercelStateMessage } from "../vercel-status";

export type EdgeProvider = "vercel" | "cloudflare";

export type VercelEdgeResult =
  | { kind: "ok"; verified: boolean; state: VercelDomainState; records: DnsRecord[]; redirectHostname: string | null; message: string | null }
  | { kind: "transient"; message: string }
  | { kind: "refused"; message: string };

type Row = { id: string; hostname: string; verification_token: string; redirect_hostname: string | null };

/** Is `hostname` already claimed (any store) in our domains table? */
async function hostnameTaken(hostname: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("domains").select("id").eq("hostname", hostname).neq("status", "removed").limit(1);
  if (error) return true; // unsure → don't claim it
  return (data?.length ?? 0) > 0;
}

const REFUSED_MESSAGE = "This domain is already connected to another Vercel project (or can't be used there). Remove it there first, then add it again.";

/**
 * Makes sure the hostname is on the Vercel project and returns its current state and the DNS
 * records the seller needs (our ownership TXT first, then Vercel's). With `allowCompanion`, the
 * apex/www companion is registered as a 308 redirect to this hostname when nobody owns it here.
 */
export async function ensureVercelDomain(row: Row, cfg: VercelConfig, opts: { allowCompanion: boolean }): Promise<VercelEdgeResult> {
  try {
    let status = await inspectProjectDomain(cfg, row.hostname);
    if (!status) {
      try {
        await addProjectDomain(cfg, row.hostname);
      } catch (err) {
        // Only a 409 from the add call refuses a hostname for good (assigned to another Vercel
        // project / not allowed). Everything else (400 deployment state, 401/403 our token, 5xx)
        // is a platform-side problem: keep the row and retry later.
        if (err instanceof VercelApiError && err.status === 409) {
          logger.warn("domains.vercel_refused", { domainId: row.id, status: err.status, code: err.code });
          return { kind: "refused", message: REFUSED_MESSAGE };
        }
        throw err;
      }
      status = await inspectProjectDomain(cfg, row.hostname);
      if (!status) return { kind: "transient", message: "Vercel hasn't confirmed the domain yet. We'll retry automatically." };
    }

    let redirectHostname = row.redirect_hostname;
    const companion = companionHostname(status.hostname, status.apexName);
    if (!redirectHostname && opts.allowCompanion && companion && !(await hostnameTaken(companion))) {
      try {
        await addProjectDomain(cfg, companion, { redirect: row.hostname, redirectStatusCode: 308 });
        redirectHostname = companion;
      } catch (err) {
        // Optional: the main domain works without it.
        logger.warn("domains.vercel_companion_failed", { domainId: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const records: DnsRecord[] = [{ type: "TXT", name: verificationRecordName(row.hostname), value: row.verification_token, purpose: "ownership" }, ...status.records];
    if (redirectHostname) {
      const comp = await inspectProjectDomain(cfg, redirectHostname).catch(() => null);
      if (comp) records.push(...comp.records.map((r) => (r.purpose === "routing" ? { ...r, purpose: "redirect" as const } : r)));
    }
    return { kind: "ok", verified: status.verified, state: status.state, records, redirectHostname, message: vercelStateMessage(status.state) };
  } catch (err) {
    logger.error("domains.vercel_failed", { domainId: row.id, status: err instanceof VercelApiError ? err.status : null, error: err instanceof Error ? err.message : String(err) });
    return { kind: "transient", message: "Couldn't reach Vercel just now. We'll retry automatically." };
  }
}

/** Removes the hostname (and anything redirecting to it) from the Vercel project. Never throws. */
export async function removeFromVercel(cfg: VercelConfig, hostname: string, redirectHostname: string | null): Promise<boolean> {
  try {
    await removeProjectDomain(cfg, hostname, { removeRedirects: true });
    if (redirectHostname) await removeProjectDomain(cfg, redirectHostname, { removeRedirects: false });
    return true;
  } catch (err) {
    // The DB row is already removed, so the host no longer routes to a store. Report for cleanup.
    logger.error("domains.vercel_delete_failed", { hostname, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
