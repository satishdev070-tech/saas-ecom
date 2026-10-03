import { describe, expect, it } from "vitest";
import { extendedTrialEnd, isMissingSchemaError, parseStoreType, planFeaturesFromForm, planFeatureValue, planLimitsJson, planSchema, sanitizeSearchTerm, storeListFilterSchema, tenantStatusSchema } from "@/features/platform/schemas";
import { percentOfLimit, storageLimitBytes, supportSessionState } from "@/features/platform/stats";
import { resolveEntitlements } from "@/features/platform/flags";
import { maskEmail, maskPhone, shortName } from "@/features/platform/privacy";
import { parseSettingValue } from "@/features/platform/settings-registry";
import { integrationPresence } from "@/features/platform/health";
import { adminNavFor, isAdminNavActive } from "@/features/platform/nav";
import { PLATFORM_ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { framingHeaders, platformFrameOrigins } from "@/lib/security/headers";

describe("store list filters", () => {
  const cat = "8f7c2a1e-3b4d-4e5f-9a6b-7c8d9e0f1a2b";
  it("parses store type and category, dropping invalid values", () => {
    const f = storeListFilterSchema.parse({ type: "demo", category: cat });
    expect(f.type).toBe("demo");
    expect(f.category).toBe(cat);
    const bad = storeListFilterSchema.parse({ type: "fake", category: "not-a-uuid" });
    expect(bad.type).toBeUndefined();
    expect(bad.category).toBeUndefined();
    const blank = storeListFilterSchema.parse({ type: "", category: "" });
    expect(blank.type).toBeUndefined();
    expect(blank.category).toBeUndefined();
    expect(storeListFilterSchema.parse({}).sort).toBe("newest");
  });
  it("maps database store_type values", () => {
    expect(parseStoreType("real")).toBe("real");
    expect(parseStoreType("test")).toBe("test");
    expect(parseStoreType("other")).toBeNull();
    expect(parseStoreType(undefined)).toBeNull();
  });
  it("recognises missing-schema errors for the pre-1800 fallback", () => {
    expect(isMissingSchemaError({ code: "PGRST202" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST205" })).toBe(true);
    expect(isMissingSchemaError({ code: "42P01" })).toBe(true);
    expect(isMissingSchemaError({ code: "42501" })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});

describe("platform schemas", () => {
  it("strips PostgREST filter syntax from search terms", () => {
    expect(sanitizeSearchTerm("a,b(c)*%:x")).toBe("a b c x");
    expect(sanitizeSearchTerm(42)).toBe("");
    expect(sanitizeSearchTerm("x".repeat(200))).toHaveLength(80);
  });
  it("requires a reason and explicit confirmation for status changes", () => {
    const base = { tenantId: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", status: "suspended", reason: "Chargeback fraud ticket #123" };
    expect(tenantStatusSchema.safeParse(base).success).toBe(false);
    expect(tenantStatusSchema.safeParse({ ...base, confirm: "yes" }).success).toBe(true);
    expect(tenantStatusSchema.safeParse({ ...base, reason: "short", confirm: "yes" }).success).toBe(false);
  });
  it("extends trials from the later of now and the current end", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(extendedTrialEnd(null, 10, now).toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(extendedTrialEnd("2026-08-01T00:00:00Z", 1, now).toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(extendedTrialEnd("2026-09-20T00:00:00Z", 5, now).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });
  it("builds plan limits and features from form input", () => {
    const input = planSchema.parse({ code: "growth", name: "Growth", priceMonthly: "999", priceYearly: "9990", trialDays: "14", limit_products: "500", limit_staff: "" });
    expect(planLimitsJson(input)).toEqual({ products: 500 });
    expect(planFeaturesFromForm({ "feature:blog": "on", "feature:x.y": "off", "feature:z": "inherit" }, ["blog", "x.y", "z"])).toEqual({ blog: true, "x.y": false });
    expect(planFeatureValue({ blog: true }, "blog")).toBe("on");
    expect(planFeatureValue(null, "blog")).toBe("inherit");
    expect(planSchema.safeParse({ code: "Bad Code", name: "x", priceMonthly: "1", priceYearly: "1", trialDays: 0 }).success).toBe(false);
  });
});

describe("entitlements", () => {
  it("resolves override > plan > default", () => {
    const e = resolveEntitlements({
      plan: { id: "p", code: "c", name: "n", features: { blog: false, locator: true }, limits: { products: 50, staff: "x" } },
      defaults: { blog: true, reviews: true, locator: false },
      overrides: { reviews: false },
    });
    expect(e.features.blog).toEqual({ enabled: false, source: "plan" });
    expect(e.features.reviews).toEqual({ enabled: false, source: "override" });
    expect(e.isEnabled("locator")).toBe(true);
    expect(e.isEnabled("unknown")).toBe(false);
    expect(e.limit("products")).toBe(50);
    expect(e.limit("staff")).toBe(0);
    expect(e.limit("storage_mb")).toBeNull();
  });
});

describe("stats & privacy", () => {
  it("computes limits and session state", () => {
    expect(percentOfLimit(5, null)).toBeNull();
    expect(percentOfLimit(5, 0)).toBe(100);
    expect(percentOfLimit(45, 50)).toBe(90);
    expect(storageLimitBytes(1)).toBe(1048576);
    const now = new Date("2026-09-01T10:00:00Z");
    expect(supportSessionState({ ended_at: null, expires_at: "2026-09-01T10:30:00Z" }, now)).toEqual({ state: "active", minutesLeft: 30 });
    expect(supportSessionState({ ended_at: null, expires_at: "2026-09-01T09:00:00Z" }, now).state).toBe("expired");
    expect(supportSessionState({ ended_at: "2026-09-01T09:00:00Z", expires_at: "2026-09-01T11:00:00Z" }, now).state).toBe("ended");
  });
  it("masks personal data", () => {
    expect(maskEmail("riya@example.com")).toBe("r•••@example.com");
    expect(maskEmail(null)).toBe("—");
    expect(maskPhone("+91 98765 43210")).toBe("+91 •••••• 3210");
    expect(shortName("Riya", "sharma")).toBe("Riya S.");
  });
});

describe("settings, health, nav", () => {
  it("parses settings by kind and rejects unknown keys", () => {
    expect(parseSettingValue("signup.enabled", "on")).toEqual({ ok: true, value: true });
    expect(parseSettingValue("signup.enabled", undefined)).toEqual({ ok: true, value: false });
    expect(parseSettingValue("nope", "x").ok).toBe(false);
  });
  it("reports integration presence as booleans only", () => {
    const rows = integrationPresence({ RESEND_API_KEY: "re_secret_value", CRON_SECRET: "  " });
    const resend = rows.find((r) => r.id === "resend")!;
    expect(resend.configured).toBe(true);
    expect(rows.find((r) => r.id === "cron")!.configured).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("re_secret_value");
  });
  it("filters admin nav by role", () => {
    const finance = adminNavFor(PLATFORM_ROLE_PERMISSIONS.finance).flatMap((g) => g.items.map((i) => i.href));
    expect(finance).toContain("/admin/plans");
    expect(finance).not.toContain("/admin/users");
    const all = adminNavFor(PLATFORM_ROLE_PERMISSIONS.super_admin).flatMap((g) => g.items);
    expect(all.length).toBeGreaterThan(8);
    expect(isAdminNavActive("/admin/tenants/x", "/admin/tenants")).toBe(true);
    expect(isAdminNavActive("/admin/tenants", "/admin")).toBe(false);
  });
});

describe("framing headers", () => {
  it("lets only the platform origin frame storefronts", () => {
    expect(framingHeaders("store", "https://paliya.store/")).toEqual({ "Content-Security-Policy": "frame-ancestors 'self' https://paliya.store" });
    expect(framingHeaders("store", "not a url")).toEqual({ "Content-Security-Policy": "frame-ancestors 'self'" });
    expect(framingHeaders("platform", "https://paliya.store")).toEqual({ "Content-Security-Policy": "frame-ancestors 'self'", "X-Frame-Options": "SAMEORIGIN" });
  });

  it("lists every exact platform origin (apex, www, aliases) and nothing else", () => {
    const origins = platformFrameOrigins("https://www.buildbrighten.in", "buildbrighten.in", ["saas-ecom-puce.vercel.app"]);
    expect(framingHeaders("store", origins)).toEqual({
      "Content-Security-Policy": "frame-ancestors 'self' https://www.buildbrighten.in https://buildbrighten.in https://saas-ecom-puce.vercel.app",
    });
    expect(platformFrameOrigins("http://localhost:3000", "localhost", [])).toEqual(["http://localhost:3000"]);
    expect(framingHeaders("store", ["javascript:alert(1)", "*.vercel.app"])).toEqual({ "Content-Security-Policy": "frame-ancestors 'self'" });
  });
});
