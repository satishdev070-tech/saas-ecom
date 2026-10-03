import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { getEntitlements } from "@/features/platform";
import { gbpRefresh, type Result } from "./api";

/**
 * The seller's Google Business Profile connection: tenant_integrations row, provider
 * "google_business" (RLS on, no policies → secret-key client only, ADR-006). Secrets (refresh and
 * access token) are one encrypted JSON object, decrypted only in memory here. Every function takes
 * a tenant id the caller resolved server-side (membership, or the row being processed by cron).
 */

const PROVIDER = "google_business";
export type GbpStatus = "not_connected" | "connected" | "error" | "expired" | "disabled";
export type GbpConnection = { status: GbpStatus; enabled: boolean; statusMessage: string | null; connectedAt: string | null; public: Record<string, string>; secrets: Record<string, string>; expiresAt: string | null };
/** Browser-safe view (no secrets). */
export type GbpConnectionView = Omit<GbpConnection, "secrets">;

function strings(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string") as [string, string][]);
}

export async function loadGbp(tenantId: string): Promise<GbpConnection | null> {
  const { data } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .select("enabled, status, status_message, connected_at, expires_at, public_config, secrets_encrypted")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!data) return null;
  let secrets: Record<string, string> = {};
  if (data.secrets_encrypted) {
    try {
      secrets = strings(JSON.parse(decryptSecret(data.secrets_encrypted)));
    } catch (err) {
      logger.error("gbp.decrypt_failed", { tenantId, error: err });
    }
  }
  return { status: data.status as GbpStatus, enabled: data.enabled, statusMessage: data.status_message, connectedAt: data.connected_at, public: strings(data.public_config), secrets, expiresAt: data.expires_at };
}

export async function gbpView(tenantId: string): Promise<GbpConnectionView | null> {
  const c = await loadGbp(tenantId);
  if (!c) return null;
  const { secrets: _secrets, ...view } = c;
  return view;
}

/** Called by the OAuth callback after state validation and a successful token exchange. */
export async function saveGbpConnection(tenantId: string, userId: string, input: { publicConfig: Record<string, string>; secrets: Record<string, string>; expiresAt: string | null }) {
  const now = new Date().toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: tenantId,
        kind: "social",
        provider: PROVIDER,
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
  await audit({ tenantId, actorUserId: userId, action: "integration.social_connected", entityType: "integration", entityId: PROVIDER, metadata: { provider: PROVIDER, account: input.publicConfig.account_name ?? null } });
}

export async function updateGbpPublic(tenantId: string, userId: string | null, patch: Record<string, string | null>) {
  const current = await loadGbp(tenantId);
  if (!current) return;
  const next: Record<string, string> = { ...current.public };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  const { error } = await createSupabaseAdminClient().from("tenant_integrations").update({ public_config: next, ...(userId ? { updated_by: userId } : {}) }).eq("tenant_id", tenantId).eq("provider", PROVIDER);
  if (error) throw mapDbError(error, { tenantId });
}

export async function recordGbpStatus(tenantId: string, status: GbpStatus, message: string | null) {
  await createSupabaseAdminClient()
    .from("tenant_integrations")
    .update({ status, status_message: message?.slice(0, 300) ?? null, last_verified_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
}

export async function disconnectGbp(tenantId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("tenant_integrations").delete().eq("tenant_id", tenantId).eq("provider", PROVIDER);
  if (error) throw mapDbError(error, { tenantId });
  await admin.from("gbp_reviews").delete().eq("tenant_id", tenantId);
  await audit({ tenantId, actorUserId: userId, action: "integration.social_disconnected", entityType: "integration", entityId: PROVIDER, metadata: { provider: PROVIDER } });
}

/**
 * A fresh access token for a connected, enabled connection on a plan with social_media, refreshing
 * it (and rotating the stored secrets) when it expires within 5 minutes. A failed refresh marks
 * the connection expired so the UI asks the seller to reconnect.
 */
export async function gbpAccess(tenantId: string): Promise<Result<{ token: string; location: string | null; conn: GbpConnection }>> {
  const conn = await loadGbp(tenantId);
  if (!conn || !conn.enabled || conn.status !== "connected" || !conn.secrets.refresh_token) return { ok: false, message: "Google Business Profile isn't connected." };
  try {
    if (!(await getEntitlements(tenantId)).isEnabled("social_media")) return { ok: false, message: "Google Business Profile isn't available on your plan." };
  } catch (err) {
    logger.warn("gbp.entitlements_unavailable", { tenantId, error: err });
    return { ok: false, message: "Couldn't check your plan. Try again shortly." };
  }
  let token = conn.secrets.access_token ?? "";
  if (!token || !conn.expiresAt || Date.parse(conn.expiresAt) < Date.now() + 5 * 60_000) {
    const r = await gbpRefresh(conn.secrets.refresh_token);
    if (!r.ok) {
      if (r.expired) await recordGbpStatus(tenantId, "expired", r.message);
      return r;
    }
    token = r.data.accessToken;
    const { error } = await createSupabaseAdminClient()
      .from("tenant_integrations")
      .update({ secrets_encrypted: encryptSecret(JSON.stringify({ ...conn.secrets, access_token: token, ...(r.data.refreshToken ? { refresh_token: r.data.refreshToken } : {}) })), expires_at: r.data.expiresAt, last_verified_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("provider", PROVIDER);
    if (error) logger.warn("gbp.token_store_failed", { tenantId, code: error.code });
  }
  return { ok: true, data: { token, location: conn.public.location_name ?? null, conn } };
}
