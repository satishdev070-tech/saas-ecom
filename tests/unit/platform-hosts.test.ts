import { describe, expect, it } from "vitest";
import { platformHostAliases } from "@/lib/platform/hosts";
import { classifyHost } from "@/lib/tenant/host";
import { checkCustomDomain } from "@/features/domains/rules";

describe("platformHostAliases", () => {
  it("is empty when nothing is configured (local development)", () => {
    expect(platformHostAliases({})).toEqual([]);
  });

  it("uses the host of NEXT_PUBLIC_PLATFORM_URL", () => {
    expect(platformHostAliases({ NEXT_PUBLIC_PLATFORM_URL: "https://saas-ecom-puce.vercel.app/" })).toEqual(["saas-ecom-puce.vercel.app"]);
    expect(platformHostAliases({ NEXT_PUBLIC_PLATFORM_URL: "http://localhost:3000" })).toEqual(["localhost"]);
  });

  it("parses PLATFORM_HOST_ALIASES and drops anything that is not a bare hostname", () => {
    expect(platformHostAliases({ PLATFORM_HOST_ALIASES: " Saas-Ecom-Puce.vercel.app , ,*.vercel.app,10.0.0.1,app.example.com" })).toEqual([
      "saas-ecom-puce.vercel.app",
      "app.example.com",
    ]);
  });

  it("trusts Vercel's own deployment and branch URLs only when they are vercel.app names", () => {
    expect(platformHostAliases({ VERCEL_URL: "saas-ecom-abc123-team.vercel.app", VERCEL_BRANCH_URL: "saas-ecom-git-fix-team.vercel.app" })).toEqual([
      "saas-ecom-abc123-team.vercel.app",
      "saas-ecom-git-fix-team.vercel.app",
    ]);
    expect(platformHostAliases({ VERCEL_URL: "brand.in" })).toEqual([]);
  });

  it("trusts VERCEL_PROJECT_PRODUCTION_URL only as a vercel.app name (it can be a seller's custom domain)", () => {
    expect(platformHostAliases({ VERCEL_PROJECT_PRODUCTION_URL: "saas-ecom-puce.vercel.app" })).toEqual(["saas-ecom-puce.vercel.app"]);
    expect(platformHostAliases({ VERCEL_PROJECT_PRODUCTION_URL: "brand.in" })).toEqual([]);
  });

  it("ignores an invalid platform URL instead of throwing", () => {
    expect(platformHostAliases({ NEXT_PUBLIC_PLATFORM_URL: "not a url" })).toEqual([]);
  });
});

describe("platform aliases in host classification", () => {
  const ROOT = "paliya.store";
  const aliases = platformHostAliases({ NEXT_PUBLIC_PLATFORM_URL: "https://saas-ecom-puce.vercel.app" });

  it("matches the alias exactly (case/port/trailing dot normalised)", () => {
    expect(classifyHost("saas-ecom-puce.vercel.app", ROOT, aliases).kind).toBe("platform");
    expect(classifyHost("SAAS-ECOM-PUCE.vercel.app:443", ROOT, aliases).kind).toBe("platform");
    expect(classifyHost("saas-ecom-puce.vercel.app.", ROOT, aliases).kind).toBe("platform");
  });

  it("never matches by suffix or prefix", () => {
    expect(classifyHost("evil.saas-ecom-puce.vercel.app", ROOT, aliases).kind).toBe("custom-domain");
    expect(classifyHost("saas-ecom-puce.vercel.app.evil.com", ROOT, aliases).kind).toBe("custom-domain");
    expect(classifyHost("xsaas-ecom-puce.vercel.app", ROOT, aliases).kind).toBe("custom-domain");
  });

  it("refuses a platform alias as a seller custom domain", () => {
    expect(checkCustomDomain("https://saas-ecom-puce.vercel.app/", ROOT, null, aliases)).toEqual({ ok: false, message: "Platform addresses can't be added as a custom domain" });
    expect(checkCustomDomain("www.brand.in", ROOT, null, aliases)).toEqual({ ok: true, hostname: "www.brand.in" });
  });
});
