import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { assertPermission, type TenantContext } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";
import { PROVIDERS, validateCredentials, type IntegrationKind, type IntegrationStatus, type ProviderId } from "../registry";

/**
 * tenant_integrations access. The table has RLS on and NO policies, so it is reachable only with
 * the secret-key client, and only from these functions, each of which receives a tenant id that
 * the caller resolved server-side (membership or verified host). Secrets are encrypted as one JSON
 * object with encryptSecret() and are decrypted only in memory here; the UI gets last-4 hints.
 */

export type LoadedIntegration = {
  provider: ProviderId;
  enabled: boolean;
  environment: "test" | "live";
  status: IntegrationStatus;
  public: Record<string, string>;
  secrets: Record<string, string>;
  expiresAt: string | null;
};

export type IntegrationSummary = {
  provider: ProviderId;
  enabled: boolean;
  environment: "test" | "live";
  status: IntegrationStatus;
  statusMessage: string | null;
  lastVerifiedAt: string | null;
  connectedAt: string | null;
  public: Record<string, string>;
  secretHints: Record<string, string | null>;
  featureEnabled: boolean;
};

type Row = {
  provider: string;
  enabled: boolean;
  environment: string;
  status: string;
  status_message: string | null;
  last_verified_at: string | null;
  connected_at: string | null;
  expires_at: string | null;
  public_config: unknown;
  secrets_encrypted: string | null;
};
const SELECT = "provider, enabled, environment, status, status_message, last_verified_at, connected_at, expires_at, public_config, secrets_encrypted";

function strings(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string") as [string, string][]);
}

function decryptAll(tenantId: string, provider: string, value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    return strings(JSON.parse(decryptSecret(value)));
  } catch (err) {
    logger.error("integrations.decrypt_failed", { tenantId, provider, error: err });
    return {};
  }
}

/** Razorpay rows migrated from tenant_payment_settings keep their secrets there until the next save. */
async function legacyRazorpaySecrets(tenantId: string): Promise<Record<string, string>> {
  const { data } = await createSupabaseAdminClient().from("tenant_payment_settings").select("key_secret_encrypted, webhook_secret_encrypted").eq("tenant_id", tenantId).maybeSingle();
  const out: Record<string, string> = {};
  try {
    if (data?.key_secret_encrypted) out.key_secret = decryptSecret(data.key_secret_encrypted);
    if (data?.webhook_secret_encrypted) out.webhook_secret = decryptSecret(data.webhook_secret_encrypted);
  } catch (err) {
    logger.error("integrations.legacy_decrypt_failed", { tenantId, error: err });
  }
  return out;
}

export async function loadIntegration(tenantId: string, provider: ProviderId): Promise<LoadedIntegration | null> {
  const { data, error } = await createSupabaseAdminClient().from("tenant_integrations").select(SELECT).eq("tenant_id", tenantId).eq("provider", provider).maybeSingle<Row>();
  if (error || !data) return null;
  const pub = strings(data.public_config);
  let secrets = decryptAll(tenantId, provider, data.secrets_encrypted);
  if (provider === "razorpay" && !data.secrets_encrypted && data.public_config && (data.public_config as { legacy?: unknown }).legacy) secrets = await legacyRazorpaySecrets(tenantId);
  return {
    provider,
    enabled: data.enabled,
    environment: data.environment === "live" ? "live" : "test",
    status: data.status as IntegrationStatus,
    public: pub,
    secrets,
    expiresAt: data.expires_at,
  };
}

/** Enabled, connected integration of a tenant whose plan/flags allow it; null otherwise. */
export async function activeIntegration(tenantId: string, provider: ProviderId): Promise<LoadedIntegration | null> {
  const it = await loadIntegration(tenantId, provider);
  if (!it || !it.enabled || it.status !== "connected") return null;
  try {
    const ent = await getEntitlements(tenantId);
    if (!ent.isEnabled(PROVIDERS[provider].feature)) return null;
  } catch (err) {
    logger.warn("integrations.entitlements_unavailable", { tenantId, provider, error: err });
    return null;
  }
  return it;
}

export async function listIntegrationSummaries(tenantId: string, kind?: IntegrationKind): Promise<IntegrationSummary[]> {
  let q = createSupabaseAdminClient().from("tenant_integrations").select(SELECT).eq("tenant_id", tenantId);
  if (kind) q = q.eq("kind", kind);
  const [{ data }, ent] = await Promise.all([q.returns<Row[]>(), getEntitlements(tenantId).catch(() => null)]);
  const rows = new Map((data ?? []).map((r) => [r.provider, r]));
  const defs = Object.values(PROVIDERS).filter((d) => !kind || d.kind === kind);
  const out: IntegrationSummary[] = [];
  for (const def of defs) {
    const r = rows.get(def.id);
    const secrets = r ? decryptAll(tenantId, def.id, r.secrets_encrypted) : {};
    if (def.id === "razorpay" && r && !r.secrets_encrypted) Object.assign(secrets, await legacyRazorpaySecrets(tenantId));
    out.push({
      provider: def.id,
      enabled: r?.enabled ?? false,
      environment: r?.environment === "live" ? "live" : "test",
      status: (r?.status as IntegrationStatus) ?? "not_connected",
      statusMessage: r?.status_message ?? null,
      lastVerifiedAt: r?.last_verified_at ?? null,
      connectedAt: r?.connected_at ?? null,
      public: r ? Object.fromEntries(Object.entries(strings(r.public_config)).filter(([k]) => k !== "legacy")) : {},
      secretHints: Object.fromEntries(def.fields.filter((f) => f.secret).map((f) => [f.key, secrets[f.key] ? secrets[f.key]!.slice(-4) : null])),
      featureEnabled: ent ? ent.isEnabled(def.feature) : true,
    });
  }
  return out;
}

async function requireFeature(ctx: TenantContext, provider: ProviderId) {
  const def = PROVIDERS[provider];
  assertPermission(ctx, def.permission);
  const ent = await getEntitlements(ctx.tenantId);
  if (!ent.isEnabled(def.feature)) throw new AppError("FORBIDDEN", { message: `${def.label} isn't available on your plan.` });
  return def;
}

export async function recordStatus(tenantId: string, provider: ProviderId, status: IntegrationStatus, message: string | null) {
  const now = new Date().toISOString();
  await createSupabaseAdminClient()
    .from("tenant_integrations")
    .update({ status, status_message: message?.slice(0, 300) ?? null, last_verified_at: now, ...(status === "connected" ? { connected_at: now } : {}) })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
}

/**
 * Saves credentials (encrypted), keeping stored secrets when a secret field is left blank.
 * The connection is NOT marked connected here; callers run testConnection() right after.
 */
export async function saveCredentials(ctx: TenantContext, provider: ProviderId, values: Record<string, string>, environment: "test" | "live") {
  const def = await requireFeature(ctx, provider);
  const current = await loadIntegration(ctx.tenantId, provider);
  const errors = validateCredentials(def, values, {
    hasSecrets: Object.fromEntries(def.fields.filter((f) => f.secret).map((f) => [f.key, Boolean(current?.secrets[f.key])])),
    public: current?.public ?? {},
  });
  if (Object.keys(errors).length) throw new AppError("VALIDATION", { fieldErrors: errors });

  const pub: Record<string, string> = { ...(current?.public ?? {}) };
  delete pub.legacy;
  const secrets: Record<string, string> = { ...(current?.secrets ?? {}) };
  const changedSecrets: string[] = [];
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.secret) {
      if (v) {
        secrets[f.key] = v;
        changedSecrets.push(f.key);
      }
    } else if (v || !f.required) pub[f.key] = v;
  }
  const env = def.environments ? environment : provider === "razorpay" && pub.key_id?.startsWith("rzp_live_") ? "live" : "test";
  const { error } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        kind: def.kind,
        provider,
        environment: env,
        public_config: pub,
        secrets_encrypted: Object.keys(secrets).length ? encryptSecret(JSON.stringify(secrets)) : null,
        status: current?.status === "connected" && !changedSecrets.length && env === current.environment ? "connected" : "not_connected",
        enabled: current?.enabled ?? false,
        updated_by: ctx.user.id,
      },
      { onConflict: "tenant_id,provider" },
    );
  if (error) throw mapDbError(error, { tenantId: ctx.tenantId });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: `integration.${def.kind}_updated`,
    entityType: "integration",
    entityId: provider,
    metadata: { provider, environment: env, public: pub, secrets_changed: changedSecrets },
  });
}

export async function setEnabled(ctx: TenantContext, provider: ProviderId, enabled: boolean) {
  const def = await requireFeature(ctx, provider);
  const current = await loadIntegration(ctx.tenantId, provider);
  if (!current) throw new AppError("CONFLICT", { message: `Configure ${def.label} first.` });
  if (enabled && current.status !== "connected") throw new AppError("CONFLICT", { message: `Run a successful connection test before enabling ${def.label}.` });
  const { error } = await createSupabaseAdminClient().from("tenant_integrations").update({ enabled, updated_by: ctx.user.id }).eq("tenant_id", ctx.tenantId).eq("provider", provider);
  if (error) throw mapDbError(error);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: enabled ? `integration.${def.kind}_enabled` : `integration.${def.kind}_disabled`, entityType: "integration", entityId: provider, metadata: { provider } });
}

export async function disconnect(ctx: TenantContext, provider: ProviderId) {
  const def = await requireFeature(ctx, provider);
  const { error } = await createSupabaseAdminClient().from("tenant_integrations").delete().eq("tenant_id", ctx.tenantId).eq("provider", provider);
  if (error) throw mapDbError(error);
  if (provider === "razorpay") await createSupabaseAdminClient().from("tenant_payment_settings").delete().eq("tenant_id", ctx.tenantId);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `integration.${def.kind}_disconnected`, entityType: "integration", entityId: provider, metadata: { provider } });
}

/** Stores OAuth tokens (social). Server-only; called by the OAuth callback after state validation. */
export async function saveOAuthConnection(
  tenantId: string,
  userId: string,
  provider: ProviderId,
  input: { publicConfig: Record<string, string>; secrets: Record<string, string>; expiresAt: string | null },
) {
  const def = PROVIDERS[provider];
  const now = new Date().toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: tenantId,
        kind: def.kind,
        provider,
        environment: "live",
        public_config: input.publicConfig,
        secrets_encrypted: encryptSecret(JSON.stringify(input.secrets)),
        status: "connected",
        status_message: null,
        enabled: true,
        connected_at: now,
        last_verified_at: now,
        expires_at: input.expiresAt,
        updated_by: userId,
      },
      { onConflict: "tenant_id,provider" },
    );
  if (error) throw mapDbError(error, { tenantId });
  await audit({ tenantId, actorUserId: userId, action: "integration.social_connected", entityType: "integration", entityId: provider, metadata: { provider, account: input.publicConfig.account_name ?? null } });
}

/**
 * Platform view: connection status per store and provider. Selects status columns only (never
 * public_config or secrets). Caller must have checked the platform permission first.
 */
export async function platformIntegrationOverview() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("tenant_integrations")
    .select("tenant_id, provider, kind, enabled, environment, status, status_message, last_verified_at, tenants!inner(name, slug)")
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(2000);
  return (data ?? []).map((r) => {
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return { tenantId: r.tenant_id, storeName: t?.name ?? "", storeSlug: t?.slug ?? "", provider: r.provider as ProviderId, kind: r.kind, enabled: r.enabled, environment: r.environment, status: r.status as IntegrationStatus, lastVerifiedAt: r.last_verified_at };
  });
}

/** Primary verified hostname of a store (webhook URLs are per store host). RLS-scoped read. */
export async function storePrimaryHost(tenantId: string): Promise<string | null> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const { data } = await (await createSupabaseServerClient()).from("domains").select("hostname, is_primary").eq("tenant_id", tenantId).eq("status", "verified").order("is_primary", { ascending: false }).limit(1);
  return data?.[0]?.hostname ?? null;
}

/** Summaries trimmed to what the browser may see (already secret-free). */
export function toCardData(s: IntegrationSummary) {
  return { provider: s.provider, enabled: s.enabled, environment: s.environment, status: s.status, statusMessage: s.statusMessage, lastVerifiedAt: s.lastVerifiedAt, public: s.public, secretHints: s.secretHints, featureEnabled: s.featureEnabled };
}

/** Rotates OAuth tokens after a refresh (server-only; status/enablement unchanged). */
export async function updateOAuthSecrets(tenantId: string, provider: ProviderId, secrets: Record<string, string>, expiresAt: string | null) {
  const { error } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .update({ secrets_encrypted: encryptSecret(JSON.stringify(secrets)), expires_at: expiresAt, last_verified_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
  if (error) throw mapDbError(error, { tenantId });
}

/** Updates non-secret settings of an OAuth connection (e.g. the Pinterest board). */
export async function updatePublicConfig(ctx: TenantContext, provider: ProviderId, patch: Record<string, string>) {
  const def = await requireFeature(ctx, provider);
  const current = await loadIntegration(ctx.tenantId, provider);
  if (!current) throw new AppError("CONFLICT", { message: `Connect ${def.label} first.` });
  const { error } = await createSupabaseAdminClient().from("tenant_integrations").update({ public_config: { ...current.public, ...patch }, updated_by: ctx.user.id }).eq("tenant_id", ctx.tenantId).eq("provider", provider);
  if (error) throw mapDbError(error);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `integration.${def.kind}_updated`, entityType: "integration", entityId: provider, metadata: { provider, public: patch } });
}
