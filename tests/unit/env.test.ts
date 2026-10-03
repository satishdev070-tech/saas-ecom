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
    expect(() => parseEnv(serverEnvSchema, { ...valid, NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store:3000" })).toThrow();
  });

  it("validates PLATFORM_HOST_ALIASES as comma-separated bare hostnames", () => {
    expect(parseEnv(serverEnvSchema, { ...valid, PLATFORM_HOST_ALIASES: "saas-ecom-puce.vercel.app, app.example.com" }).PLATFORM_HOST_ALIASES).toBeDefined();
    expect(() => parseEnv(serverEnvSchema, { ...valid, PLATFORM_HOST_ALIASES: "https://saas-ecom-puce.vercel.app" })).toThrow(EnvValidationError);
    expect(() => parseEnv(serverEnvSchema, { ...valid, PLATFORM_HOST_ALIASES: "*.vercel.app" })).toThrow(EnvValidationError);
  });

  it("reduces a pasted URL in NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN to the bare root domain", () => {
    const root = (v: string) => parseEnv(serverEnvSchema, { ...valid, NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: v }).NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN;
    expect(root("https://paliya.store")).toBe("paliya.store");
    expect(root("https://www.BuildBrighten.in/")).toBe("buildbrighten.in");
    expect(root(" www.buildbrighten.in ")).toBe("buildbrighten.in");
    expect(root("buildbrighten.in.")).toBe("buildbrighten.in");
    expect(root("localhost")).toBe("localhost");
    expect(() => root("https://")).toThrow(EnvValidationError);
    expect(() => root("https://buildbrighten.in:8443/")).toThrow(EnvValidationError);
  });
});
