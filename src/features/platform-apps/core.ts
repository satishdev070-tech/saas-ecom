import { z } from "zod";

/**
 * Platform app credentials (pure helpers, no I/O). The super admin enters the platform's OAuth
 * apps (Meta, Pinterest, Google) and AI API keys in the console; env vars remain a fallback.
 * Secrets never leave the server: status objects carry only "configured", the source and a
 * masked hint.
 */

export const APP_PROVIDERS = ["meta", "pinterest", "google", "gemini", "groq", "anthropic", "resend"] as const;
export type AppProvider = (typeof APP_PROVIDERS)[number];

export const AI_PROVIDERS = ["gemini", "groq", "anthropic"] as const satisfies readonly AppProvider[];
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** OAuth providers need a client id + secret; AI providers only an API key (stored as `secret`). */
export const needsClientId = (p: AppProvider) => p === "meta" || p === "pinterest" || p === "google";

/** Non-secret settings kept in `extra` (plain JSON). Anything else is dropped. */
export const EXTRA_KEYS: Record<AppProvider, readonly string[]> = {
  meta: ["webhookVerifyToken"],
  pinterest: [],
  google: [],
  gemini: ["model"],
  groq: ["model"],
  anthropic: ["model"],
  resend: ["from"],
};

export type AppCredential = { clientId: string | null; secret: string; extra: Record<string, string>; source: "db" | "env" };

export type CredentialRow = { client_id: string | null; secret_ciphertext: string | null; extra: unknown } | null;

/** The env fallback for each provider (names are the documented env vars). */
export type EnvLike = Partial<Record<string, string | undefined>>;
const ENV_NAMES: Record<AppProvider, { id?: string; secret: string; extra?: Record<string, string> }> = {
  meta: { id: "META_APP_ID", secret: "META_APP_SECRET", extra: { webhookVerifyToken: "META_WEBHOOK_VERIFY_TOKEN" } },
  pinterest: { id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET" },
  google: { id: "GOOGLE_OAUTH_CLIENT_ID", secret: "GOOGLE_OAUTH_CLIENT_SECRET" },
  gemini: { secret: "GEMINI_API_KEY" },
  groq: { secret: "GROQ_API_KEY" },
  anthropic: { secret: "ANTHROPIC_API_KEY" },
  resend: { secret: "RESEND_API_KEY", extra: { from: "EMAIL_FROM" } },
};
export const envNamesFor = (p: AppProvider) => ENV_NAMES[p];

export function cleanExtra(provider: AppProvider, raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of EXTRA_KEYS[provider]) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

/**
 * DB first, env fallback. The DB row wins only when it is complete (secret, plus client id for
 * OAuth providers); otherwise the env pair is used. Non-secret `extra` merges (DB overrides env),
 * so a verify token generated in the console works with env-configured app keys too.
 * `decrypt` failures (rotated APP_SECRET, corrupt value) count as "not set" in the DB.
 */
export function resolveCredential(provider: AppProvider, row: CredentialRow, decrypt: (ciphertext: string) => string, env: EnvLike): AppCredential | null {
  const names = ENV_NAMES[provider];
  const envExtra: Record<string, string> = {};
  for (const [k, name] of Object.entries(names.extra ?? {})) if (env[name]) envExtra[k] = env[name]!;
  const extra = { ...envExtra, ...cleanExtra(provider, row?.extra) };

  let dbSecret: string | null = null;
  if (row?.secret_ciphertext) {
    try {
      dbSecret = decrypt(row.secret_ciphertext) || null;
    } catch {
      dbSecret = null;
    }
  }
  const dbId = row?.client_id || null;
  if (dbSecret && (!needsClientId(provider) || dbId)) return { clientId: needsClientId(provider) ? dbId : null, secret: dbSecret, extra, source: "db" };

  const envSecret = env[names.secret] || null;
  const envId = names.id ? env[names.id] || null : null;
  if (envSecret && (!needsClientId(provider) || envId)) return { clientId: envId, secret: envSecret, extra, source: "env" };
  return null;
}

/** "••1234" — the last 4 characters only, and only for values long enough not to reveal much. */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  return secret.length >= 12 ? `••${secret.slice(-4)}` : "••••";
}

export type AppCredentialStatus = {
  provider: AppProvider;
  configured: boolean;
  source: "db" | "env" | null;
  /** Client / App id is public (it appears in every OAuth URL); shown so the admin can check it. */
  clientId: string | null;
  secretHint: string | null;
  /** A row exists in the DB but is incomplete (e.g. only the client id was saved). */
  incomplete: boolean;
  /** A row is saved in the console (it may only hold non-secret settings). */
  savedInDb: boolean;
  extraKeys: string[];
};

export function toStatus(provider: AppProvider, cred: AppCredential | null, row: CredentialRow): AppCredentialStatus {
  const incomplete = Boolean(row && (row.client_id || row.secret_ciphertext) && cred?.source !== "db");
  return {
    provider,
    configured: Boolean(cred),
    source: cred?.source ?? null,
    clientId: cred?.clientId ?? row?.client_id ?? null,
    secretHint: maskSecret(cred?.secret),
    incomplete,
    savedInDb: Boolean(row),
    extraKeys: Object.keys(cred?.extra ?? cleanExtra(provider, row?.extra)),
  };
}

// ---- Input schemas (shared by the admin form and the server action) -----------------------

/** `Name <addr@domain>` or `addr@domain`; no quotes, commas or control characters (header-safe). */
export const FROM_RE = /^(?:[^"<>,;:@\\\u0000-\u001f]{1,80} <[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+>|[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+)$/;

const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v);

export const saveAppCredentialSchema = z.object({
  provider: z.enum(APP_PROVIDERS),
  clientId: z.preprocess(blankToUndef, z.string().max(300).regex(/^[A-Za-z0-9._-]{3,300}$/, "Use the App ID / client ID exactly as shown in the developer console").optional()),
  /** Write-only: blank keeps the saved secret. */
  secret: z.preprocess(blankToUndef, z.string().min(10, "That secret looks too short").max(500).regex(/^\S+$/, "Secrets don't contain spaces").optional()),
  /** Resend only: the sender mailbox, on a domain verified in Resend. Not secret. */
  from: z.preprocess(blankToUndef, z.string().max(200).regex(FROM_RE, "Use an address on your verified domain, e.g. Build Brighten <no-reply@mail.buildbrighten.in>").optional()),
});
export type SaveAppCredentialInput = z.infer<typeof saveAppCredentialSchema>;

export const providerOnlySchema = z.object({ provider: z.enum(APP_PROVIDERS) });
