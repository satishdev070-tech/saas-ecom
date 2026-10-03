import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Runs the real src/proxy.ts against a request for `host` and reports where it routed. */
async function route(env: Record<string, string>, host: string, path = "/") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxxxxxxxxxxxxxxxxxxx");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { proxy } = await import("@/proxy");
  const res = await proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  const rewrite = res.headers.get("x-middleware-rewrite");
  return rewrite ? new URL(rewrite).pathname : "next";
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy host routing (Vercel production alias)", () => {
  const PROD = { NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store", NEXT_PUBLIC_PLATFORM_URL: "https://saas-ecom-puce.vercel.app" };

  it("reproduces the bug: the alias was rewritten into the storefront when not configured", async () => {
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store" }, "saas-ecom-puce.vercel.app")).toBe("/store/saas-ecom-puce.vercel.app");
  });

  it("serves / on the platform URL host as the platform homepage", async () => {
    expect(await route(PROD, "saas-ecom-puce.vercel.app")).toBe("next");
    expect(await route(PROD, "saas-ecom-puce.vercel.app", "/login")).toBe("next");
    expect(await route(PROD, "saas-ecom-puce.vercel.app", "/api/health")).toBe("next");
  });

  it("accepts the alias through PLATFORM_HOST_ALIASES too", async () => {
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store", PLATFORM_HOST_ALIASES: "saas-ecom-puce.vercel.app" }, "saas-ecom-puce.vercel.app")).toBe("next");
  });

  it("serves the Vercel production alias with no extra configuration", async () => {
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store", VERCEL_PROJECT_PRODUCTION_URL: "saas-ecom-puce.vercel.app" }, "saas-ecom-puce.vercel.app")).toBe("next");
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "paliya.store", VERCEL_PROJECT_PRODUCTION_URL: "www.thepaliya.com" }, "www.thepaliya.com")).toBe("/store/www.thepaliya.com");
  });

  it("keeps store hosts, unknown hosts and reserved hosts on their existing paths", async () => {
    expect(await route(PROD, "acme.paliya.store")).toBe("/store/acme.paliya.store");
    expect(await route(PROD, "www.thepaliya.com", "/products/x")).toBe("/store/www.thepaliya.com/products/x");
    expect(await route(PROD, "other-project.vercel.app")).toBe("/store/other-project.vercel.app");
    expect(await route(PROD, "admin.paliya.store")).toBe("/_unknown-host");
    expect(await route(PROD, "saas-ecom-puce.vercel.app", "/store/acme.paliya.store")).toBe("/_unknown-host");
  });

  it("keeps local development working", async () => {
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "localhost" }, "localhost:3000")).toBe("next");
    expect(await route({ NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: "localhost" }, "acme.localhost:3000")).toBe("/store/acme.localhost");
  });
});
