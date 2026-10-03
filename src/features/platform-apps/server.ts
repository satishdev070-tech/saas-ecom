import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, randomToken } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { assertPlatformPermission, type PlatformContext } from "@/lib/platform/access";
import type { Json } from "@/lib/supabase/database.types";
import {
  AI_PROVIDERS,
  APP_PROVIDERS,
  cleanExtra,
  needsClientId,
  resolveCredential,
  toStatus,
  type AiProvider,
  type AppCredential,
  type AppCredentialStatus,
  type AppProvider,
  type CredentialRow,
  type SaveAppCredentialInput,
} from "./core";

export type { AiProvider, AppCredential, AppCredentialStatus, AppProvider } from "./core";

/**
 * Platform app credentials (Meta / Pinterest / Google OAuth apps, AI API keys).
 * Storage: `platform_app_credentials` — RLS on with no policies, so only the secret-key client
 * reads it (ADR-006: platform configuration read by server code; writes only after an explicit
 * `platform.settings.manage` check). Secrets are AES-256-GCM with a dedicated purpose key.
 */
const PURPOSE = "platform-app-credentials";

const loadRow = cache(async (provider: AppProvider): Promise<CredentialRow> => {
  const { data, error } = await createSupabaseAdminClient().from("platform_app_credentials").select("client_id, secret_ciphertext, extra").eq("provider", provider).maybeSingle();
  if (error) {
    // Missing table (migration not applied yet) or transient error: fall back to env.
    logger.warn("platform_apps.read_failed", { provider, code: error.code });
    return null;
  }
  return data;
});

const decrypt = (ct: string) => decryptSecret(ct, PURPOSE);

/** DB first, env fallback; null when the provider isn't configured. Cached per request. */
export const getAppCredential = cache(async (provider: AppProvider): Promise<AppCredential | null> => {
  return resolveCredential(provider, await loadRow(provider), decrypt, serverEnv());
});

/** Configured AI providers, in the platform's preference order (gemini, groq, anthropic). */
export async function getAiProviderOrder(): Promise<AiProvider[]> {
  const creds = await Promise.all(AI_PROVIDERS.map((p) => getAppCredential(p)));
  return AI_PROVIDERS.filter((_, i) => creds[i] !== null);
}

/** Configured or not + source + masked hint for every provider. Never returns secrets. */
export async function listAppCredentialStatus(ctx: PlatformContext): Promise<AppCredentialStatus[]> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  return Promise.all(APP_PROVIDERS.map(async (p) => toStatus(p, await getAppCredential(p), await loadRow(p))));
}

/** The Meta webhook verify token, for display to a platform admin on the setup page only. */
export async function getMetaWebhookVerifyToken(ctx: PlatformContext): Promise<string | null> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const row = await loadRow("meta");
  return cleanExtra("meta", row?.extra).webhookVerifyToken ?? serverEnv().META_WEBHOOK_VERIFY_TOKEN ?? null;
}

function platformAudit(ctx: PlatformContext, action: `${string}.${string}`, provider: AppProvider, metadata: Record<string, Json | undefined>) {
  return audit({ tenantId: null, actorUserId: ctx.user.id, actorType: "platform", action, entityType: "platform_app_credential", entityId: provider, metadata });
}

async function freshRow(provider: AppProvider) {
  const { data, error } = await createSupabaseAdminClient().from("platform_app_credentials").select("client_id, secret_ciphertext, extra").eq("provider", provider).maybeSingle();
  if (error) throw new AppError("INTERNAL", { cause: error });
  return data;
}

/** Upserts a provider's credentials. Blank fields keep what's saved (secrets are write-only). */
export async function saveAppCredential(ctx: PlatformContext, input: SaveAppCredentialInput): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const p = input.provider;
  const clientId = needsClientId(p) ? input.clientId : undefined;
  const from = p === "resend" ? input.from : undefined;
  if (!clientId && !input.secret && !from) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Enter at least one value to save."] } });
  const before = await freshRow(p);
  const extra = from ? { ...cleanExtra(p, before?.extra), from } : (before?.extra ?? {});
  const { error } = await createSupabaseAdminClient()
    .from("platform_app_credentials")
    .upsert(
      {
        provider: p,
        client_id: clientId ?? before?.client_id ?? null,
        secret_ciphertext: input.secret ? encryptSecret(input.secret, PURPOSE) : (before?.secret_ciphertext ?? null),
        extra: extra as Json,
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  if (error) throw new AppError("INTERNAL", { cause: error });
  // Values are never audited, only which fields changed.
  await platformAudit(ctx, "platform_app_credential.saved", p, { client_id_changed: Boolean(clientId && clientId !== before?.client_id), secret_changed: Boolean(input.secret), from_changed: Boolean(from && from !== cleanExtra(p, before?.extra).from) });
}

/** Deletes the saved row; the provider falls back to env (if set) or becomes unconfigured. */
export async function clearAppCredential(ctx: PlatformContext, provider: AppProvider): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const { error } = await createSupabaseAdminClient().from("platform_app_credentials").delete().eq("provider", provider);
  if (error) throw new AppError("INTERNAL", { cause: error });
  await platformAudit(ctx, "platform_app_credential.cleared", provider, {});
}

/** Generates (or rotates) the Meta webhook verify token and stores it in `extra`. */
export async function rotateMetaWebhookVerifyToken(ctx: PlatformContext): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const before = await freshRow("meta");
  const extra = { ...cleanExtra("meta", before?.extra), webhookVerifyToken: randomToken(24) };
  const { error } = await createSupabaseAdminClient()
    .from("platform_app_credentials")
    .upsert({ provider: "meta", client_id: before?.client_id ?? null, secret_ciphertext: before?.secret_ciphertext ?? null, extra, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: "provider" });
  if (error) throw new AppError("INTERNAL", { cause: error });
  await platformAudit(ctx, "platform_app_credential.verify_token_rotated", "meta", { had_token: Boolean(cleanExtra("meta", before?.extra).webhookVerifyToken) });
}

/** Resend settings for /admin/email: non-secret values and a masked key hint only. */
export async function getEmailProviderStatus(ctx: PlatformContext): Promise<AppCredentialStatus & { from: string | null; dbFrom: string | null }> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  const [cred, row] = await Promise.all([getAppCredential("resend"), loadRow("resend")]);
  const dbFrom = cleanExtra("resend", row?.extra).from ?? null;
  return { ...toStatus("resend", cred, row), from: cred?.extra.from ?? dbFrom ?? serverEnv().EMAIL_FROM, dbFrom };
}
