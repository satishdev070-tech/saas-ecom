import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { maskSecret, resolveCredential, saveAppCredentialSchema, toStatus, type CredentialRow } from "@/features/platform-apps/core";
import { oauthRedirectUri, setupGuides } from "@/features/platform-apps/setup";

const enc = (s: string) => `ct:${s}`;
const dec = (c: string) => {
  if (!c.startsWith("ct:")) throw new Error("bad");
  return c.slice(3);
};
const SECRET = "db-secret-abcdef-1234";
const ENV_SECRET = "env-secret-zyxwvu-9876";

describe("platform app credential resolution", () => {
  it("prefers a complete DB row over env", () => {
    const row: CredentialRow = { client_id: "1111", secret_ciphertext: enc(SECRET), extra: {} };
    expect(resolveCredential("meta", row, dec, { META_APP_ID: "2222", META_APP_SECRET: ENV_SECRET })).toEqual({ clientId: "1111", secret: SECRET, extra: {}, source: "db" });
  });

  it("falls back to env when the DB row is missing, incomplete or undecryptable", () => {
    const env = { PINTEREST_APP_ID: "p-env", PINTEREST_APP_SECRET: ENV_SECRET };
    expect(resolveCredential("pinterest", null, dec, env)?.source).toBe("env");
    expect(resolveCredential("pinterest", { client_id: "p-db", secret_ciphertext: null, extra: {} }, dec, env)).toMatchObject({ clientId: "p-env", source: "env" });
    expect(resolveCredential("pinterest", { client_id: null, secret_ciphertext: enc(SECRET), extra: {} }, dec, env)?.source).toBe("env");
    expect(resolveCredential("pinterest", { client_id: "p-db", secret_ciphertext: "garbage", extra: {} }, dec, env)?.source).toBe("env");
  });

  it("returns null when neither source is complete", () => {
    expect(resolveCredential("google", null, dec, { GOOGLE_OAUTH_CLIENT_ID: "only-id.apps.googleusercontent.com" })).toBeNull();
    expect(resolveCredential("groq", null, dec, {})).toBeNull();
  });

  it("treats AI providers as key-only", () => {
    expect(resolveCredential("gemini", { client_id: null, secret_ciphertext: enc(SECRET), extra: {} }, dec, {})).toEqual({ clientId: null, secret: SECRET, extra: {}, source: "db" });
    expect(resolveCredential("anthropic", null, dec, { ANTHROPIC_API_KEY: ENV_SECRET })).toMatchObject({ clientId: null, source: "env" });
  });

  it("merges allowed extra keys (DB over env) and drops unknown ones", () => {
    const row: CredentialRow = { client_id: null, secret_ciphertext: null, extra: { webhookVerifyToken: "db-token", evil: "x" } };
    const c = resolveCredential("meta", row, dec, { META_APP_ID: "2222", META_APP_SECRET: ENV_SECRET, META_WEBHOOK_VERIFY_TOKEN: "env-token-xxxxxxxx" });
    expect(c).toEqual({ clientId: "2222", secret: ENV_SECRET, extra: { webhookVerifyToken: "db-token" }, source: "env" });
  });
});

describe("masking and status", () => {
  it("masks to the last 4 characters only for long values", () => {
    expect(maskSecret("abcdefghijkl1234")).toBe("••1234");
    expect(maskSecret("short")).toBe("••••");
    expect(maskSecret(null)).toBeNull();
  });

  it("status never contains the secret or ciphertext", () => {
    const row: CredentialRow = { client_id: "1111", secret_ciphertext: enc(SECRET), extra: { webhookVerifyToken: "tok-tok-tok-tok-tok" } };
    const s = toStatus("meta", resolveCredential("meta", row, dec, {}), row);
    expect(s).toMatchObject({ provider: "meta", configured: true, source: "db", clientId: "1111", secretHint: "••1234", incomplete: false, savedInDb: true, extraKeys: ["webhookVerifyToken"] });
    const json = JSON.stringify(s);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain("ct:");
    expect(json).not.toContain("tok-tok");
  });

  it("flags an incomplete DB row and reports env as the source", () => {
    const row: CredentialRow = { client_id: "p-db", secret_ciphertext: null, extra: {} };
    const s = toStatus("pinterest", resolveCredential("pinterest", row, dec, {}), row);
    expect(s).toMatchObject({ configured: false, source: null, incomplete: true, clientId: "p-db", secretHint: null });
    const e = toStatus("pinterest", resolveCredential("pinterest", null, dec, { PINTEREST_APP_ID: "p-env", PINTEREST_APP_SECRET: ENV_SECRET }), null);
    expect(e).toMatchObject({ configured: true, source: "env", savedInDb: false, secretHint: "••9876" });
    expect(JSON.stringify(e)).not.toContain(ENV_SECRET);
  });
});

describe("input schema", () => {
  it("treats blank secret as keep-existing and rejects junk", () => {
    expect(saveAppCredentialSchema.parse({ provider: "meta", clientId: " 1234567 ", secret: "" })).toEqual({ provider: "meta", clientId: "1234567", secret: undefined });
    expect(saveAppCredentialSchema.safeParse({ provider: "meta", secret: "has space in it" }).success).toBe(false);
    expect(saveAppCredentialSchema.safeParse({ provider: "whatsapp", secret: "x".repeat(20) }).success).toBe(false);
    expect(saveAppCredentialSchema.safeParse({ provider: "google", clientId: "a b" }).success).toBe(false);
  });
});

describe("setup guide URLs", () => {
  it("builds exact callback and webhook URLs from the platform origin", () => {
    expect(oauthRedirectUri("https://paliya.store/", "google-business")).toBe("https://paliya.store/api/oauth/google-business/callback");
    const g = setupGuides("https://paliya.store");
    const meta = g.find((x) => x.provider === "meta")!;
    expect(meta.redirectUris).toEqual(["https://paliya.store/api/oauth/meta/callback"]);
    expect(meta.webhooks.map((w) => w.url)).toEqual(["https://paliya.store/api/webhooks/meta", "https://paliya.store/api/webhooks/whatsapp"]);
    expect(meta.permissions.map((p) => p.name)).toEqual(expect.arrayContaining(["pages_manage_posts", "instagram_content_publish", "pages_messaging", "instagram_manage_messages", "whatsapp_business_messaging"]));
    expect(g.find((x) => x.provider === "google")!.redirectUris).toEqual(["https://paliya.store/api/oauth/youtube/callback", "https://paliya.store/api/oauth/google-business/callback"]);
    expect(g.map((x) => x.provider)).toEqual(["meta", "pinterest", "google", "gemini", "groq", "anthropic"]);
  });
});

// ---- server.ts with the real AES-GCM crypto and a mocked admin client --------------------

const rows = new Map<string, CredentialRow>();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: (_c: string, provider: string) => ({ maybeSingle: async () => ({ data: rows.get(provider) ?? null, error: null }) }) }) }),
  }),
}));

describe("getAppCredential (server)", () => {
  beforeAll(() => {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
      NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store",
      SUPABASE_SECRET_KEY: "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx",
      APP_SECRET: "a".repeat(40),
      GROQ_API_KEY: "gsk_env_key_123456",
    });
  });
  beforeEach(() => rows.clear());

  it("decrypts a DB secret with the dedicated purpose key and falls back to env", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    const { getAppCredential, getAiProviderOrder } = await import("@/features/platform-apps/server");
    rows.set("gemini", { client_id: null, secret_ciphertext: encryptSecret("gemini-db-key-123456", "platform-app-credentials"), extra: {} });
    // Wrong purpose = undecryptable = not set in DB.
    rows.set("anthropic", { client_id: null, secret_ciphertext: encryptSecret("sk-ant-wrong-purpose", "tenant-secrets"), extra: {} });
    expect(await getAppCredential("gemini")).toEqual({ clientId: null, secret: "gemini-db-key-123456", extra: {}, source: "db" });
    expect(await getAppCredential("groq")).toMatchObject({ secret: "gsk_env_key_123456", source: "env" });
    expect(await getAppCredential("anthropic")).toBeNull();
    expect(await getAiProviderOrder()).toEqual(["gemini", "groq"]);
  });
});
