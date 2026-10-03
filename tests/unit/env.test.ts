import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv, serverEnvSchema } from "@/lib/env/schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
  NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store",
  SUPABASE_SECRET_KEY: "sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx",
  APP_SECRET: "a".repeat(40),
};

describe("env validation", () => {
  it("accepts a complete config and treats blank optionals as unset", () => {
    const env = parseEnv(serverEnvSchema, { ...valid, EDGE_SHARED_SECRET: "" });
    expect(env.EDGE_SHARED_SECRET).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("reports missing variable names without leaking values", () => {
    try {
      parseEnv(serverEnvSchema, { ...valid, SUPABASE_SECRET_KEY: undefined, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain("SUPABASE_SECRET_KEY");
      expect(msg).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(msg).not.toContain("not-a-url");
    }
  });

  it("rejects a root domain with a scheme or port", () => {
    expect(() => parseEnv(serverEnvSchema, { ...valid, NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "https://paliya.store" })).toThrow();
    expect(() => parseEnv(serverEnvSchema, { ...valid, NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store:3000" })).toThrow();
  });
});
