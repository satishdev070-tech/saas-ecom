import { describe, expect, it } from "vitest";
import { activatePlanSchema, decidePlanRequestSchema, requestKind, requestPlanSchema, yearlySavingPercent } from "@/features/billing/schemas";

const id = "10000000-0000-4000-a000-000000000001";

describe("plan requests", () => {
  it("classifies the request against the current plan", () => {
    expect(requestKind({ priceMonthly: 999 }, { priceMonthly: 2999 }, false)).toBe("upgrade");
    expect(requestKind({ priceMonthly: 2999 }, { priceMonthly: 999 }, false)).toBe("downgrade");
    expect(requestKind({ priceMonthly: 2999 }, { priceMonthly: 2999 }, true)).toBe("activate");
    expect(requestKind(null, { priceMonthly: 999 }, true)).toBe("activate");
  });

  it("computes the yearly saving", () => {
    expect(yearlySavingPercent(999, 9990)).toBe(17);
    expect(yearlySavingPercent(999, 11988)).toBe(0);
    expect(yearlySavingPercent(0, 0)).toBe(0);
  });

  it("validates inputs", () => {
    expect(requestPlanSchema.parse({ planId: id, cycle: "yearly", note: " " })).toEqual({ planId: id, cycle: "yearly", note: undefined });
    expect(requestPlanSchema.safeParse({ planId: "x" }).success).toBe(false);
    expect(decidePlanRequestSchema.parse({ requestId: id, decision: "approve", months: "12" }).months).toBe(12);
    expect(decidePlanRequestSchema.safeParse({ requestId: id, decision: "maybe" }).success).toBe(false);
    expect(activatePlanSchema.safeParse({ tenantId: id, planId: id, reason: "short" }).success).toBe(false);
    expect(activatePlanSchema.safeParse({ tenantId: id, planId: id, reason: "Paid by bank transfer, ref 42" }).success).toBe(true);
  });
});
