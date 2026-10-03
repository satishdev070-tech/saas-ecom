import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { publicEnv } from "@/lib/env/public";
import { normalizeHost } from "@/lib/tenant/host";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { assertPermission, type TenantContext } from "@/lib/tenant/membership";
import type { Tables } from "@/lib/supabase/database.types";
import { getTenantEntitlements } from "@/features/platform";
import { canAddAnotherDomain, checkCustomDomain, statusAfterFailedCheck, FAILED_RECHECK_HOURS, type SslStatus } from "../rules";
import { checkDomainDns } from "../dns";
import { cloudflareConfigFrom, createCustomHostname, deleteCustomHostname, getCustomHostname, type CloudflareConfig } from "../cloudflare";
import { vercelConfig, type VercelConfig } from "@/lib/vercel/domains";
import { platformHostAliases } from "@/lib/platform/hosts";
import { ensureVercelDomain, removeFromVercel, type EdgeProvider } from "./vercel-edge";

/**
 * Custom-domain lifecycle (docs/CLOUDFLARE.md, docs/DEPLOY_VERCEL.md):
 *   add (pending, seller, RLS insert; on Vercel the hostname is registered on the project right
 *   away so the exact DNS records can be shown) → verify (ownership TXT via DoH, plus CNAME on
 *   Cloudflare or Vercel's verified flag on Vercel; server sets verified with the secret key)
 *   → edge SSL (Cloudflare custom hostname / Vercel `misconfigured: false`) → optional primary
 *   → remove (soft, RPC) + edge delete.
 * Only this module (secret-key client) ever writes status = 'verified'.
 */

export const DOMAIN_COLUMNS =
  "id, tenant_id, hostname, type, status, verification_token, verified_at, ssl_status, is_primary, provider_ref, last_checked_at, last_error, created_at, provider, provider_status, dns_records, redirect_hostname" as const;
/** Columns that exist before migration 21 (`20261003002100_domains_vercel.sql`). */
const LEGACY_DOMAIN_COLUMNS =
  "id, tenant_id, hostname, type, status, verification_token, verified_at, ssl_status, is_primary, provider_ref, last_checked_at, last_error, created_at" as const;

/** PostgREST/Postgres "column does not exist": the database is behind the code (a migration is missing). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? ""));
}
export type DomainRow = Pick<
  Tables<"domains">,
  | "id"
  | "tenant_id"
  | "hostname"
  | "type"
  | "status"
  | "verification_token"
  | "verified_at"
  | "ssl_status"
  | "is_primary"
  | "provider_ref"
  | "last_checked_at"
  | "last_error"
  | "created_at"
  | "provider"
  | "provider_status"
  | "dns_records"
  | "redirect_hostname"
>;

export type DomainSettings = {
  rootDomain: string;
  /** CNAME target checked over DoH (Cloudflare setup). Null on Vercel: routing is checked through Vercel's API. */
  cnameTarget: string | null;
  cloudflare: CloudflareConfig | null;
  vercel: VercelConfig | null;
  /** Edge used for NEW domains: Vercel wins when both are configured. */
  edge: EdgeProvider | null;
};

/**
 * Reads only the settings domains need (not the whole server env), so the Domains page still
 * renders when an unrelated server secret is missing. Each value is still validated.
 */
export function domainSettings(): DomainSettings {
  const vercel = vercelConfig();
  const cloudflare = cloudflareConfigFrom({ CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID });
  return {
    rootDomain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN,
    cnameTarget: vercel ? null : normalizeHost(process.env.CUSTOM_DOMAIN_CNAME_TARGET),
    cloudflare,
    vercel,
    edge: vercel ? "vercel" : cloudflare ? "cloudflare" : null,
  };
}

/** Which edge manages this row: the one that registered it, else the configured default. */
function edgeFor(row: Pick<DomainRow, "provider">, settings: DomainSettings): EdgeProvider | null {
  if (row.provider === "cloudflare" && settings.cloudflare) return "cloudflare";
  if (row.provider === "vercel" && settings.vercel) return "vercel";
  return settings.edge;
}

type Actor = { userId: string | null; type: "user" | "platform" | "system" };

// ---- Reads --------------------------------------------------------------------------

/** Tenant's domains (platform subdomain + custom), as the signed-in member (RLS). */
export async function listTenantDomains(tenantId: string): Promise<DomainRow[]> {
  const supabase = await createSupabaseServerClient();
  const list = (columns: string) =>
    supabase
      .from("domains")
      .select(columns)
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("type", { ascending: false }) // platform_subdomain first
      .order("created_at");
  const { data, error } = await list(DOMAIN_COLUMNS);
  if (!error) return (data ?? []) as unknown as DomainRow[];
  if (!isMissingColumn(error)) throw mapDbError(error, { tenantId });

  // Database without migration 21: list domains without the edge columns instead of failing.
  logger.error("domains.schema_outdated", { tenantId, code: error.code, error: error.message, fix: "apply supabase/dev/apply-2100.sql" });
  const legacy = await list(LEGACY_DOMAIN_COLUMNS);
  if (legacy.error) throw mapDbError(legacy.error, { tenantId });
  return ((legacy.data ?? []) as unknown as Omit<DomainRow, "provider" | "provider_status" | "dns_records" | "redirect_hostname">[]).map((d) => ({
    ...d,
    provider: null,
    provider_status: null,
    dns_records: [],
    redirect_hostname: null,
  }));
}

export type DomainAllowance = { enabled: boolean; limit: number | null; used: number; canAdd: boolean; planName: string | null };

export async function getDomainAllowance(tenantId: string, domains?: DomainRow[]): Promise<DomainAllowance> {
  const [ent, rows] = await Promise.all([getTenantEntitlements(tenantId), domains ? Promise.resolve(domains) : listTenantDomains(tenantId)]);
  const used = rows.filter((d) => d.type === "custom" && d.status !== "removed").length;
  const enabled = ent.isEnabled("custom_domains");
  const limit = ent.limit("custom_domains");
  return { enabled, limit, used, canAdd: enabled && canAddAnotherDomain(used, limit), planName: ent.plan?.name ?? null };
}

// ---- Seller mutations -----------------------------------------------------------------

export async function addCustomDomain(ctx: TenantContext, rawHostname: string): Promise<DomainRow> {
  assertPermission(ctx, "domains.manage");
  const settings = domainSettings();
  const check = checkCustomDomain(rawHostname, settings.rootDomain, settings.cnameTarget, platformHostAliases());
  if (!check.ok) throw new AppError("VALIDATION", { fieldErrors: { hostname: [check.message] } });

  const allowance = await getDomainAllowance(ctx.tenantId);
  if (!allowance.enabled) throw new AppError("FORBIDDEN", { message: "Custom domains aren't included in your plan.", fieldErrors: { _form: ["Custom domains aren't included in your current plan. Upgrade to connect your own domain."] } });
  if (!allowance.canAdd) {
    throw new AppError("VALIDATION", { fieldErrors: { _form: [`Your plan allows ${allowance.limit} custom domain${allowance.limit === 1 ? "" : "s"}. Remove one to add another.`] } });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("domains")
    .insert({ tenant_id: ctx.tenantId, hostname: check.hostname, type: "custom" })
    .select(DOMAIN_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new AppError("CONFLICT", { fieldErrors: { hostname: ["This domain is already connected to a store. Contact support if you own it."] }, context: { hostname: check.hostname } });
    }
    throw mapDbError(error, { tenantId: ctx.tenantId });
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "domain.added", entityType: "domain", entityId: data.id, metadata: { hostname: data.hostname } });
  if (settings.vercel) return registerOnVercel(data, settings.vercel);
  return data;
}

/**
 * Registers a just-added domain on the Vercel project and stores the DNS records to show.
 * A hard refusal (domain on another Vercel project / not allowed) releases the row again so the
 * seller sees the reason; a transient failure keeps it and the cron retries.
 */
async function registerOnVercel(row: DomainRow, cfg: VercelConfig): Promise<DomainRow> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const edge = await ensureVercelDomain(row, cfg, { allowCompanion: true });
  if (edge.kind === "refused") {
    await admin.from("domains").update({ status: "removed", last_checked_at: now, last_error: edge.message }).eq("id", row.id).eq("status", "pending");
    await audit({ tenantId: row.tenant_id, actorUserId: null, actorType: "system", action: "domain.edge_refused", entityType: "domain", entityId: row.id, metadata: { hostname: row.hostname, provider: "vercel" } });
    throw new AppError("CONFLICT", { fieldErrors: { hostname: [edge.message] }, context: { hostname: row.hostname } });
  }
  const patch =
    edge.kind === "ok"
      ? { provider: "vercel", provider_ref: row.hostname, provider_status: edge.state, dns_records: edge.records, redirect_hostname: edge.redirectHostname, last_error: null }
      : { last_error: edge.message, provider_status: "error" };
  const { data, error } = await admin.from("domains").update(patch).eq("id", row.id).select(DOMAIN_COLUMNS).single();
  if (error) throw mapDbError(error, { domainId: row.id });
  return data;
}

/** Loads a domain with the secret key, scoped to the server-resolved tenant when given. */
async function loadDomain(domainId: string, tenantId: string | null): Promise<DomainRow | null> {
  const admin = createSupabaseAdminClient();
  let query = admin.from("domains").select(DOMAIN_COLUMNS).eq("id", domainId).eq("type", "custom").neq("status", "removed");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query.maybeSingle();
  if (error) throw mapDbError(error, { domainId });
  return data;
}

export type VerifyOutcome = { status: DomainRow["status"]; verified: boolean; sslStatus: SslStatus; message: string | null };

/** Seller "Verify now". Caller must have rate-limited already. */
export async function verifyTenantDomain(ctx: TenantContext, domainId: string): Promise<VerifyOutcome> {
  assertPermission(ctx, "domains.manage");
  const row = await loadDomain(domainId, ctx.tenantId);
  if (!row) throw new AppError("NOT_FOUND");
  return runDomainCheck(row, { userId: ctx.user.id, type: "user" }, { allowExpire: false });
}

/** Platform "Re-check" from /admin (caller has checked platform.tenants.manage and audits the action). */
export async function recheckDomainAsPlatform(domainId: string, actorUserId: string): Promise<VerifyOutcome & { tenantId: string }> {
  const row = await loadDomain(domainId, null);
  if (!row) throw new AppError("NOT_FOUND");
  const outcome = await runDomainCheck(row, { userId: actorUserId, type: "platform" }, { allowExpire: false });
  return { ...outcome, tenantId: row.tenant_id };
}

export async function setPrimaryDomain(ctx: TenantContext, domainId: string): Promise<void> {
  assertPermission(ctx, "domains.manage");
  const settings = domainSettings();
  const supabase = await createSupabaseServerClient();
  const { data: row, error: readError } = await supabase.from("domains").select(DOMAIN_COLUMNS).eq("id", domainId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (readError) throw mapDbError(readError);
  if (!row || row.status === "removed") throw new AppError("NOT_FOUND");
  if (row.status !== "verified") throw new AppError("VALIDATION", { fieldErrors: { _form: ["Verify this domain before making it primary."] } });
  if (row.type === "custom" && edgeFor(row, settings) && row.ssl_status !== "active") {
    throw new AppError("VALIDATION", { fieldErrors: { _form: ["Wait until SSL is active for this domain before making it primary."] } });
  }
  const { error } = await supabase.rpc("set_primary_domain", { p_domain: domainId });
  if (error) throw mapDbError(error, { domainId });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "domain.primary_changed", entityType: "domain", entityId: domainId, metadata: { hostname: row.hostname } });
}

export async function removeCustomDomain(ctx: TenantContext, domainId: string): Promise<void> {
  assertPermission(ctx, "domains.manage");
  const supabase = await createSupabaseServerClient();
  // Scope to the active store BEFORE mutating (a member of several stores must not remove
  // another store's domain from this store's screen).
  const { data: owned, error: readError } = await supabase.from("domains").select("id, provider, redirect_hostname").eq("id", domainId).eq("tenant_id", ctx.tenantId).eq("type", "custom").neq("status", "removed").maybeSingle();
  if (readError) throw mapDbError(readError, { domainId });
  if (!owned) throw new AppError("NOT_FOUND");
  const { data, error } = await supabase.rpc("remove_custom_domain", { p_domain: domainId });
  if (error) throw mapDbError(error, { domainId });
  const removed = data?.[0];
  if (!removed || removed.tenant_id !== ctx.tenantId) throw new AppError("NOT_FOUND");

  const settings = domainSettings();
  let edgeCleanup: "deleted" | "skipped" | "failed" = "skipped";
  if (owned.provider === "vercel" && settings.vercel) {
    edgeCleanup = (await removeFromVercel(settings.vercel, removed.hostname, owned.redirect_hostname)) ? "deleted" : "failed";
  } else if (owned.provider !== "vercel" && settings.cloudflare && removed.provider_ref) {
    try {
      await deleteCustomHostname(settings.cloudflare, removed.provider_ref);
      edgeCleanup = "deleted";
    } catch (err) {
      // The DB row is already removed, so the host no longer routes to this tenant.
      // A leftover custom hostname is harmless; it is reported for manual cleanup.
      edgeCleanup = "failed";
      logger.error("domains.cloudflare_delete_failed", { domainId, error: err });
    }
  }
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "domain.removed",
    entityType: "domain",
    entityId: domainId,
    metadata: { hostname: removed.hostname, edge_cleanup: edgeCleanup, provider: owned.provider, provider_ref: removed.provider_ref },
  });
}

// ---- Verification core (seller, platform and cron) -------------------------------------

async function ensureEdgeHostname(row: DomainRow, cf: CloudflareConfig): Promise<{ providerRef: string; sslStatus: SslStatus; error: string | null }> {
  const existing = row.provider_ref ? await getCustomHostname(cf, row.provider_ref) : null;
  const ch = existing ?? (await createCustomHostname(cf, row.hostname));
  return { providerRef: ch.id, sslStatus: ch.sslStatus, error: ch.sslStatus === "failed" ? (ch.errors[0] ?? "SSL certificate could not be issued") : null };
}

async function runDomainCheck(row: DomainRow, actor: Actor, opts: { allowExpire: boolean }): Promise<VerifyOutcome> {
  const settings = domainSettings();
  const admin = createSupabaseAdminClient();
  const now = new Date();

  // Already verified: only (re)establish the edge hostname / refresh SSL.
  if (row.status === "verified") return refreshEdge(row, settings);
  if (edgeFor(row, settings) === "vercel" && settings.vercel) return runVercelCheck(row, settings.vercel, actor, opts);

  const dns = await checkDomainDns(row.hostname, row.verification_token, settings.cnameTarget);

  if (dns.verified) {
    let providerRef = row.provider_ref;
    let sslStatus: SslStatus = "pending";
    let lastError: string | null = null;
    if (settings.cloudflare) {
      try {
        const edge = await ensureEdgeHostname(row, settings.cloudflare);
        providerRef = edge.providerRef;
        sslStatus = edge.sslStatus;
        lastError = edge.error;
      } catch (err) {
        logger.error("domains.cloudflare_create_failed", { domainId: row.id, error: err });
        lastError = "Domain verified. SSL setup is queued and will be retried automatically.";
      }
    }
    const { data, error } = await admin
      .from("domains")
      .update({
        status: "verified",
        verified_at: now.toISOString(),
        last_checked_at: now.toISOString(),
        last_error: lastError,
        provider_ref: providerRef,
        ssl_status: sslStatus,
        ...(settings.cloudflare && providerRef ? { provider: "cloudflare" } : {}),
      })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (error) throw mapDbError(error, { domainId: row.id });
    if (data) {
      await audit({
        tenantId: row.tenant_id,
        actorUserId: actor.userId,
        actorType: actor.type,
        action: "domain.verified",
        entityType: "domain",
        entityId: row.id,
        metadata: { hostname: row.hostname, ssl_status: sslStatus, provider_ref: providerRef },
      });
    }
    return { status: "verified", verified: true, sslStatus, message: lastError };
  }

  const transient = dns.txt === "error" || dns.cname === "error";
  let next = transient ? row.status : statusAfterFailedCheck(new Date(row.created_at), now);
  if (next === "removed" && !opts.allowExpire) next = "failed";

  if (next === "removed") {
    const { error } = await admin
      .from("domains")
      .update({ status: "removed", is_primary: false, last_checked_at: now.toISOString(), last_error: "Verification expired. Add the domain again to retry." })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]);
    if (error) throw mapDbError(error, { domainId: row.id });
    await audit({ tenantId: row.tenant_id, actorUserId: null, actorType: "system", action: "domain.expired", entityType: "domain", entityId: row.id, metadata: { hostname: row.hostname } });
    return { status: "removed", verified: false, sslStatus: row.ssl_status as SslStatus, message: "Verification expired." };
  }

  const { error } = await admin
    .from("domains")
    .update({ status: next, last_checked_at: now.toISOString(), last_error: dns.message })
    .eq("id", row.id)
    .in("status", ["pending", "failed"]);
  if (error) throw mapDbError(error, { domainId: row.id });
  return { status: next, verified: false, sslStatus: row.ssl_status as SslStatus, message: dns.message };
}

/**
 * Vercel flow for an unverified row: ownership TXT (ours, via DoH) AND Vercel's own `verified`
 * flag must both pass before the row becomes verified (and so routable). SSL is active only when
 * Vercel reports `misconfigured: false`.
 */
async function runVercelCheck(row: DomainRow, cfg: VercelConfig, actor: Actor, opts: { allowExpire: boolean }): Promise<VerifyOutcome> {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const [dns, edge] = await Promise.all([checkDomainDns(row.hostname, row.verification_token, null), ensureVercelDomain(row, cfg, { allowCompanion: !row.provider })]);
  const edgePatch =
    edge.kind === "ok"
      ? { provider: "vercel", provider_ref: row.hostname, provider_status: edge.state, dns_records: edge.records, redirect_hostname: edge.redirectHostname }
      : edge.kind === "transient"
        ? { provider_status: "error" }
        : {};
  const sslStatus: SslStatus = edge.kind === "ok" && edge.state === "active" ? "active" : "pending";

  if (dns.verified && edge.kind === "ok" && edge.verified) {
    const { data, error } = await admin
      .from("domains")
      .update({ ...edgePatch, status: "verified", verified_at: now.toISOString(), last_checked_at: now.toISOString(), last_error: edge.message, ssl_status: sslStatus })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (error) throw mapDbError(error, { domainId: row.id });
    if (data) {
      await audit({
        tenantId: row.tenant_id,
        actorUserId: actor.userId,
        actorType: actor.type,
        action: "domain.verified",
        entityType: "domain",
        entityId: row.id,
        metadata: { hostname: row.hostname, ssl_status: sslStatus, provider: "vercel", provider_status: edge.state },
      });
    }
    return { status: "verified", verified: true, sslStatus, message: edge.message };
  }

  const message = dns.verified ? edge.message : dns.message;
  const transient = dns.txt === "error" || edge.kind === "transient";
  let next = transient ? row.status : statusAfterFailedCheck(new Date(row.created_at), now);
  if (next === "removed" && !opts.allowExpire) next = "failed";

  if (next === "removed" || edge.kind === "refused") {
    const reason = edge.kind === "refused" ? edge.message : "Verification expired. Add the domain again to retry.";
    const { error } = await admin
      .from("domains")
      .update({ status: "removed", is_primary: false, ssl_status: "not_applicable", last_checked_at: now.toISOString(), last_error: reason })
      .eq("id", row.id)
      .in("status", ["pending", "failed"]);
    if (error) throw mapDbError(error, { domainId: row.id });
    await removeFromVercel(cfg, row.hostname, edge.kind === "ok" ? edge.redirectHostname : row.redirect_hostname);
    await audit({ tenantId: row.tenant_id, actorUserId: null, actorType: "system", action: edge.kind === "refused" ? "domain.edge_refused" : "domain.expired", entityType: "domain", entityId: row.id, metadata: { hostname: row.hostname, provider: "vercel" } });
    return { status: "removed", verified: false, sslStatus: "not_applicable", message: reason };
  }

  const { error } = await admin
    .from("domains")
    .update({ ...edgePatch, status: next, last_checked_at: now.toISOString(), last_error: message })
    .eq("id", row.id)
    .in("status", ["pending", "failed"]);
  if (error) throw mapDbError(error, { domainId: row.id });
  return { status: next, verified: false, sslStatus: row.ssl_status as SslStatus, message };
}

/** Verified Vercel row: refresh the edge state. Ownership stays verified; SSL follows Vercel's config. */
async function refreshVercel(row: DomainRow, cfg: VercelConfig): Promise<VerifyOutcome> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const edge = await ensureVercelDomain(row, cfg, { allowCompanion: !row.provider });
  if (edge.kind !== "ok") {
    // Can't confirm the edge right now: keep the last known SSL state, record the reason.
    await admin.from("domains").update({ last_checked_at: now, last_error: edge.message, provider_status: "error" }).eq("id", row.id).eq("status", "verified");
    return { status: "verified", verified: true, sslStatus: row.ssl_status as SslStatus, message: edge.message };
  }
  const sslStatus: SslStatus = edge.verified && edge.state === "active" ? "active" : "pending";
  const { error } = await admin
    .from("domains")
    .update({ provider: "vercel", provider_ref: row.hostname, provider_status: edge.state, dns_records: edge.records, redirect_hostname: edge.redirectHostname, ssl_status: sslStatus, last_checked_at: now, last_error: edge.message })
    .eq("id", row.id)
    .eq("status", "verified");
  if (error) throw mapDbError(error, { domainId: row.id });
  if (sslStatus !== row.ssl_status) {
    await audit({ tenantId: row.tenant_id, actorUserId: null, actorType: "system", action: "domain.ssl_status_changed", entityType: "domain", entityId: row.id, metadata: { hostname: row.hostname, from: row.ssl_status, to: sslStatus, provider: "vercel" } });
  }
  return { status: "verified", verified: true, sslStatus, message: edge.message };
}

async function refreshEdge(row: DomainRow, settings: DomainSettings): Promise<VerifyOutcome> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const edgeKind = edgeFor(row, settings);
  if (edgeKind === "vercel" && settings.vercel) return refreshVercel(row, settings.vercel);
  if (!settings.cloudflare) {
    await admin.from("domains").update({ last_checked_at: now }).eq("id", row.id);
    return { status: "verified", verified: true, sslStatus: row.ssl_status as SslStatus, message: null };
  }
  try {
    const edge = await ensureEdgeHostname(row, settings.cloudflare);
    const { error } = await admin
      .from("domains")
      .update({ provider: "cloudflare", provider_ref: edge.providerRef, ssl_status: edge.sslStatus, last_checked_at: now, last_error: edge.error })
      .eq("id", row.id)
      .eq("status", "verified");
    if (error) throw mapDbError(error, { domainId: row.id });
    if (edge.sslStatus !== row.ssl_status) {
      await audit({ tenantId: row.tenant_id, actorUserId: null, actorType: "system", action: "domain.ssl_status_changed", entityType: "domain", entityId: row.id, metadata: { hostname: row.hostname, from: row.ssl_status, to: edge.sslStatus } });
    }
    return { status: "verified", verified: true, sslStatus: edge.sslStatus, message: edge.error };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("domains.cloudflare_refresh_failed", { domainId: row.id, error: err });
    await admin.from("domains").update({ last_checked_at: now }).eq("id", row.id);
    return { status: "verified", verified: true, sslStatus: row.ssl_status as SslStatus, message: "Couldn't reach Cloudflare. We'll retry automatically." };
  }
}

// ---- Cron ----------------------------------------------------------------------------

export type DomainCronSummary = { scanned: number; verified: number; stillPending: number; failed: number; expired: number; sslActive: number; errors: number };

/**
 * Re-verifies pending/failed domains and refreshes SSL for verified ones, oldest check
 * first, in small parallel chunks. Batched so one run stays well inside the time limit.
 */
export async function runDomainMaintenance(opts: { batchSize?: number; concurrency?: number } = {}): Promise<DomainCronSummary> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 50, 1), 200);
  const concurrency = Math.min(Math.max(opts.concurrency ?? 5, 1), 10);
  const settings = domainSettings();
  const admin = createSupabaseAdminClient();
  const failedCutoff = new Date(Date.now() - FAILED_RECHECK_HOURS * 3_600_000).toISOString();
  const verifiedCutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const branches = ["status.eq.pending", "last_checked_at.is.null", `and(status.eq.failed,last_checked_at.lt."${failedCutoff}")`];
  if (settings.edge) branches.push("and(status.eq.verified,ssl_status.neq.active)", `and(status.eq.verified,last_checked_at.lt."${verifiedCutoff}")`);

  const { data, error } = await admin
    .from("domains")
    .select(DOMAIN_COLUMNS)
    .eq("type", "custom")
    .in("status", ["pending", "failed", "verified"])
    .or(branches.join(","))
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (error) throw mapDbError(error, { job: "domains.cron" });

  const summary: DomainCronSummary = { scanned: data.length, verified: 0, stillPending: 0, failed: 0, expired: 0, sslActive: 0, errors: 0 };
  for (let i = 0; i < data.length; i += concurrency) {
    const chunk = data.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((row) => runDomainCheck(row, { userId: null, type: "system" }, { allowExpire: true })));
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        summary.errors++;
        logger.error("domains.cron_check_failed", { domainId: chunk[idx]?.id, error: r.reason });
        return;
      }
      const o = r.value;
      if (o.status === "removed") summary.expired++;
      else if (o.status === "failed") summary.failed++;
      else if (o.status === "pending") summary.stillPending++;
      else if (o.verified && chunk[idx]?.status !== "verified") summary.verified++;
      if (o.sslStatus === "active") summary.sslActive++;
    });
  }
  return summary;
}
