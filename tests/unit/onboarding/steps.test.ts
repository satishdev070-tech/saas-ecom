import { describe, expect, it } from "vitest";
import { cleanPlanCode, onboardingHref, previousStep, resolveStep, stepIndex } from "@/features/onboarding/steps";
import { signUpSchema } from "@/features/auth/schemas";

describe("onboarding steps", () => {
  it("forces the business step until a store exists", () => {
    expect(resolveStep("plan", false)).toBe("business");
    expect(resolveStep(undefined, false)).toBe("business");
  });
  it("resumes at theme by default once a store exists, and honours valid steps", () => {
    expect(resolveStep(undefined, true)).toBe("theme");
    expect(resolveStep("plan", true)).toBe("plan");
    expect(resolveStep("ready", true)).toBe("ready");
    expect(resolveStep("account", true)).toBe("theme");
    expect(resolveStep("../admin", true)).toBe("theme");
  });
  it("supports back navigation", () => {
    expect(previousStep("theme")).toBe("business");
    expect(previousStep("ready")).toBe("plan");
    expect(previousStep("business")).toBeNull();
    expect(stepIndex("account")).toBe(0);
  });
  it("builds step URLs that carry plan and theme choices", () => {
    expect(onboardingHref("business")).toBe("/onboarding");
    expect(onboardingHref("theme", "t1", { plan: "growth", theme: "minimal-d2c" })).toBe("/onboarding?step=theme&store=t1&plan=growth&theme=minimal-d2c");
  });
  it("accepts only plan-code shaped values", () => {
    expect(cleanPlanCode("growth")).toBe("growth");
    expect(cleanPlanCode("Growth")).toBeNull();
    expect(cleanPlanCode("<script>")).toBeNull();
    expect(cleanPlanCode(42)).toBeNull();
  });
});

describe("sign-up carries marketing choices", () => {
  const base = { displayName: "Asha", email: "asha@example.com", password: "a-long-pass-1", storeName: "Asha Crafts" };
  it("keeps valid plan/theme codes and silently drops malformed ones", () => {
    expect(signUpSchema.parse({ ...base, plan: "growth", theme: "minimal-d2c" })).toMatchObject({ plan: "growth", theme: "minimal-d2c" });
    const bad = signUpSchema.parse({ ...base, plan: "DROP TABLE", theme: "x" });
    expect(bad.plan).toBeUndefined();
    expect(bad.theme).toBeUndefined();
  });
});
