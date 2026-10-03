import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { mapDbError } from "@/lib/supabase/errors";
import { logger } from "@/lib/observability/logger";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/membership";
import { subscribeWaba, whatsappNumber } from "./graph";

/**
 * WhatsApp Business (Cloud API) connection stored in tenant_integrations (provider "whatsapp",
 * kind "social"). Same rules as features/integrations/server/store.ts: secret-key client, tenant
 * id from membership, access token encrypted with encryptSecret() and only decrypted here.
 * public_config: { phone_number_id, waba_id, display_phone, account_name }.
 */
export type WhatsAppConnection = { phoneNumberId: string; wabaId: string; displayPhone: string; accountName: string; token: string };
export type WhatsAppSummary = { status: string; enabled: boolean; statusMessage: string | null; phoneNumberId: string | null; wabaId: string | null; displayPhone: string | null; accountName: string | null; tokenHint: string | null; connectedAt: string | null };

type Row = { status: string; enabled: boolean; status_message: string | null; connected_at: string | null; public_config: unknown; secrets_encrypted: string | null };

function decode(tenantId: string, row: Row) {
  const pub = (row.public_config && typeof row.public_config === "object" ? row.public_config : {}) as Record<string, unknown>;
  let token: string | null = null;
  if (row.secrets_encrypted) {
    try {
      const s = JSON.parse(decryptSecret(row.secrets_encrypted)) as { access_token?: unknown };
      token = typeof s.access_token === "string" ? s.access_token : null;
    } catch (err) {
      logger.error("inbox.whatsapp_decrypt_failed", { tenantId, error: err });
    }
  }
  const s = (k: string) => (typeof pub[k] === "string" ? (pub[k] as string) : null);
  return { pub: { phoneNumberId: s("phone_number_id"), wabaId: s("waba_id"), displayPhone: s("display_phone"), accountName: s("account_name") }, token };
}

async function loadRow(tenantId: string): Promise<Row | null> {
  const { data } = await createSupabaseAdminClient().from("tenant_integrations").select("status, enabled, status_message, connected_at, public_config, secrets_encrypted").eq("tenant_id", tenantId).eq("provider", "whatsapp").maybeSingle<Row>();
  return data ?? null;
}

/** Browser-safe summary (token reduced to its last 4 characters). */
export async function whatsappSummary(tenantId: string): Promise<WhatsAppSummary> {
  const row = await loadRow(tenantId);
  if (!row) return { status: "not_connected", enabled: false, statusMessage: null, phoneNumberId: null, wabaId: null, displayPhone: null, accountName: null, tokenHint: null, connectedAt: null };
  const { pub, token } = decode(tenantId, row);
  return { status: row.status, enabled: row.enabled, statusMessage: row.status_message, ...pub, tokenHint: token ? token.slice(-4) : null, connectedAt: row.connected_at };
}

/** Connected + enabled connection with its token (server use only). */
export async function activeWhatsApp(tenantId: string): Promise<WhatsAppConnection | null> {
  const row = await loadRow(tenantId);
  if (!row || row.status !== "connected" || !row.enabled) return null;
  const { pub, token } = decode(tenantId, row);
  if (!pub.phoneNumberId || !token) return null;
  return { phoneNumberId: pub.phoneNumberId, wabaId: pub.wabaId ?? "", displayPhone: pub.displayPhone ?? "", accountName: pub.accountName ?? "", token };
}

/**
 * Validates the credentials with GET /{phone-number-id} and only then stores them as connected.
 * A blank token keeps the stored one. Also subscribes the Meta app to the WABA's webhooks; a
 * failure there is reported but doesn't block the connection.
 */
export async function connectWhatsApp(ctx: TenantContext, input: { phoneNumberId: string; wabaId: string; token: string }): Promise<{ displayPhone: string; accountName: string; webhookNote: string | null }> {
  const current = await loadRow(ctx.tenantId);
  const token = input.token || (current ? decode(ctx.tenantId, current).token : null);
  if (!token) throw new AppError("VALIDATION", { fieldErrors: { token: ["Enter the permanent access token"] } });
  // One number belongs to one store; otherwise webhook routing would be ambiguous.
  const { data: taken } = await createSupabaseAdminClient().from("tenant_integrations").select("tenant_id").eq("provider", "whatsapp").eq("public_config->>phone_number_id", input.phoneNumberId).neq("tenant_id", ctx.tenantId).limit(1);
  if (taken?.length) throw new AppError("CONFLICT", { message: "This WhatsApp number is already connected to another store." });
  const check = await whatsappNumber(input.phoneNumberId, token);
  if (!check.ok) throw new AppError("VALIDATION", { message: `Not connected: ${check.message}` });
  const sub = await subscribeWaba(input.wabaId, token);
  const now = new Date().toISOString();
  const { error } = await createSupabaseAdminClient()
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        kind: "social",
        provider: "whatsapp",
        environment: "live",
        public_config: { phone_number_id: input.phoneNumberId, waba_id: input.wabaId, display_phone: check.data.phone.slice(0, 40), account_name: check.data.name.slice(0, 200) },
        secrets_encrypted: encryptSecret(JSON.stringify({ access_token: token })),
        status: "connected",
        status_message: sub.ok ? null : `Webhook subscription failed: ${sub.message}`.slice(0, 300),
        enabled: true,
        connected_at: now,
        last_verified_at: now,
        updated_by: ctx.user.id,
      },
      { onConflict: "tenant_id,provider" },
    );
  if (error) throw mapDbError(error, { tenantId: ctx.tenantId });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "integration.social_connected", entityType: "integration", entityId: "whatsapp", metadata: { provider: "whatsapp", phone_number_id: input.phoneNumberId, waba_id: input.wabaId, token_changed: Boolean(input.token) } });
  return { displayPhone: check.data.phone, accountName: check.data.name, webhookNote: sub.ok ? null : sub.message };
}

export async function disconnectWhatsApp(ctx: TenantContext) {
  const { error } = await createSupabaseAdminClient().from("tenant_integrations").delete().eq("tenant_id", ctx.tenantId).eq("provider", "whatsapp");
  if (error) throw mapDbError(error);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "integration.social_disconnected", entityType: "integration", entityId: "whatsapp", metadata: { provider: "whatsapp" } });
}

export async function markWhatsAppExpired(tenantId: string, message: string) {
  await createSupabaseAdminClient().from("tenant_integrations").update({ status: "expired", status_message: message.slice(0, 300) }).eq("tenant_id", tenantId).eq("provider", "whatsapp");
}
