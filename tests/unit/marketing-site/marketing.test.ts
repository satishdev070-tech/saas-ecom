import { describe, expect, it } from "vitest";
import { FALLBACK_PLANS, findPlan, hasYearlyBilling, normalizePlans, parsePlanRow, planComparison, planPriceView, recommendedPlanCode, yearlySavingsPercent } from "@/features/marketing-site/plans";
import { serializeJsonLd } from "@/features/marketing-site/seo";
import { buildFaqs, FOOTER_GROUPS, NAV_LINKS, signupHref } from "@/features/marketing-site/content";
import { filterThemes, findTheme, isThemeKey, parseThemeQuery, showcaseThemes, themeIndustries, themesHref, THEMES_PER_PAGE } from "@/features/marketing-site/themes";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";

const row = { code: "growth", name: "Growth", description: null, price_monthly: "999.00", price_yearly: 9990, currency: "INR", limits: { products: 500 }, features: { blog: true }, trial_days: 14, sort_order: 1, active: true };

describe("marketing plans", () => {
  it("parses DB rows into paise and drops inactive/invalid ones", () => {
    const p = parsePlanRow(row as never)!;
    expect(p.monthlyMinor).toBe(99900);
    expect(p.yearlyMinor).toBe(999000);
    expect(parsePlanRow({ ...row, active: false } as never)).toBeNull();
    expect(parsePlanRow({ ...row, currency: "USD" } as never)).toBeNull();
    expect(normalizePlans([row as never]).length).toBe(1);
  });
  it("prices yearly billing honestly", () => {
    expect(yearlySavingsPercent(99900, 999000)).toBe(16);
    expect(yearlySavingsPercent(100, 5000)).toBe(0);
    const v = planPriceView(parsePlanRow(row as never)!, "yearly");
    expect(v.note).toContain("billed yearly");
    expect(FALLBACK_PLANS.length).toBeGreaterThan(0);
    expect(recommendedPlanCode(FALLBACK_PLANS.slice(0, 2))).toBeNull();
  });
  it("only offers the yearly switch when every plan has both prices", () => {
    expect(hasYearlyBilling(FALLBACK_PLANS)).toBe(true);
    expect(hasYearlyBilling([{ ...FALLBACK_PLANS[0]!, yearlyMinor: 0 }])).toBe(false);
    expect(hasYearlyBilling([])).toBe(false);
  });
  it("builds the comparison table from limits and features only", () => {
    const rows = planComparison(FALLBACK_PLANS);
    const domains = rows.find((r) => r.label === "Custom domains")!;
    expect(domains.cells).toEqual([false, "1", "3"]);
    expect(rows.find((r) => r.label === "Products")!.cells).toEqual(["200", "2,000", "20,000"]);
    expect(rows.find((r) => r.label === "Analytics CSV exports")!.cells).toEqual([false, false, true]);
    for (const r of rows) expect(r.cells).toHaveLength(FALLBACK_PLANS.length);
  });
  it("finds plans by code without trusting unknown codes", () => {
    expect(findPlan(FALLBACK_PLANS, "growth")?.name).toBe("Growth");
    expect(findPlan(FALLBACK_PLANS, "free-forever")).toBeUndefined();
    expect(findPlan(FALLBACK_PLANS, null)).toBeUndefined();
  });
});

describe("marketing content & seo", () => {
  it("escapes JSON-LD so it cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toContain("alert");
  });
  it("has FAQs and only relative, existing-route links", () => {
    expect(buildFaqs("buildbrighten.in").length).toBeGreaterThan(3);
    const routes = ["/features", "/themes", "/how-it-works", "/pricing", "/seller/register", "/seller/login", "/seller/forgot-password", "/terms", "/privacy"];
    for (const l of [...NAV_LINKS, ...FOOTER_GROUPS.flatMap((g) => g.links)]) expect(routes).toContain(l.href);
  });
  it("never promises online plan purchase or card collection", () => {
    const text = buildFaqs("x.in", 14).map((f) => f.answer).join(" ");
    expect(text).toContain("can't be bought online yet");
    expect(text).not.toMatch(/\d+ (merchants|sellers|stores) (trust|use)/i);
  });
  it("carries plan and theme choices into sign-up", () => {
    expect(signupHref()).toBe("/seller/register");
    expect(signupHref({ plan: "growth", theme: "minimal-d2c" })).toBe("/seller/register?plan=growth&theme=minimal-d2c");
  });
});

describe("public theme catalogue", () => {
  it("parses untrusted query params", () => {
    expect(parseThemeQuery({ q: "  Minimal ", industry: "fashion", page: "2" })).toEqual({ q: "Minimal", industry: "fashion", page: 2 });
    expect(parseThemeQuery({ industry: "weapons", page: "-4" })).toEqual({ q: "", industry: "", page: 1 });
    expect(parseThemeQuery({ q: ["a", "b"], page: "9999" }).page).toBe(50);
  });
  it("filters by category and search text, and paginates", () => {
    const all = filterThemes({ q: "", industry: "", page: 1 });
    expect(all.total).toBe(MARKETPLACE_THEMES.length);
    expect(all.items).toHaveLength(Math.min(THEMES_PER_PAGE, MARKETPLACE_THEMES.length));
    const beauty = filterThemes({ q: "", industry: "beauty", page: 1 });
    expect(beauty.total).toBeGreaterThan(0);
    expect(beauty.items.every((t) => t.industry === "beauty")).toBe(true);
    expect(filterThemes({ q: "zzzz-no-match", industry: "", page: 1 }).total).toBe(0);
    const last = filterThemes({ q: "", industry: "", page: 50 });
    expect(last.page).toBe(last.pages);
  });
  it("lists only industries that have themes", () => {
    const list = themeIndustries();
    expect(list.reduce((n, i) => n + i.count, 0)).toBe(MARKETPLACE_THEMES.length);
  });
  it("validates theme keys and builds showcase picks from the real catalogue", () => {
    const first = MARKETPLACE_THEMES[0]!;
    expect(isThemeKey(first.key)).toBe(true);
    expect(isThemeKey("../../etc")).toBe(false);
    expect(isThemeKey("not-a-theme")).toBe(false);
    expect(findTheme(first.key)?.name).toBe(first.name);
    const picks = showcaseThemes(["fashion", "beauty", "nope"]);
    expect(picks.map((t) => t.industry)).toEqual(["fashion", "beauty"]);
    expect(themesHref({ industry: "beauty", page: 1 })).toBe("/themes?industry=beauty");
  });
});
