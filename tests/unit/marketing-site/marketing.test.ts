import { describe, expect, it } from "vitest";
import { FALLBACK_PLANS, normalizePlans, parsePlanRow, planPriceView, recommendedPlanCode, yearlySavingsPercent } from "@/features/marketing-site/plans";
import { THEME_LOOKS, contrastRatio, findLook, DEFAULT_LOOK_KEY } from "@/features/marketing-site/looks";
import { serializeJsonLd } from "@/features/marketing-site/seo";
import { buildFaqs, NAV_LINKS } from "@/features/marketing-site/content";

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
});

describe("marketing looks & seo", () => {
  it("every theme look has readable body text", () => {
    for (const l of THEME_LOOKS) {
      expect(contrastRatio(l.colors.text, l.colors.background), l.key).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(l.colors.onAccent, l.colors.accent), l.key).toBeGreaterThanOrEqual(3);
    }
    expect(findLook("missing").key).toBe(DEFAULT_LOOK_KEY);
  });
  it("escapes JSON-LD so it cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toContain("alert");
  });
  it("has FAQs and relative nav links", () => {
    expect(buildFaqs("paliya.store").length).toBeGreaterThan(3);
    for (const l of NAV_LINKS) expect(l.href.startsWith("/")).toBe(true);
  });
});
