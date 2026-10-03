import { describe, expect, it } from "vitest";
import { describeDiscount, discountDbValue, discountFormSchema, discountStatus, normalizeDiscountCode } from "@/features/marketing/discount-form";
import { formatMoney } from "@/lib/money";

const NOW = new Date("2026-09-24T06:30:00.000Z");
const P1 = "32000000-0000-4000-a000-000000000001";
const schema = discountFormSchema(NOW);

function errors(input: Record<string, unknown>) {
  const r = schema.safeParse(input);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("discount form parsing", () => {
  it("normalises codes to uppercase", () => {
    expect(normalizeDiscountCode("  diwali 20 ")).toBe("DIWALI20");
    const d = schema.parse({ title: "Diwali", code: "diwali-20", type: "percentage", percent: "20", enabled: "on" });
    expect(d.code).toBe("DIWALI-20");
    expect(d.automatic).toBe(false);
    expect(d.percent).toBe(20);
    expect(d.status).toBe("active");
    expect(d.startsAt).toBe(NOW.toISOString());
    expect(discountDbValue(d)).toBe(20);
  });

  it("parses fixed amounts to paise and schedules in IST", () => {
    const d = schema.parse({
      title: "Flat 250",
      code: "FLAT250",
      type: "fixed_amount",
      amount: "249.50",
      minSubtotal: "1,499",
      startsAt: "2026-10-01T09:00",
      endsAt: "2026-10-05T23:59",
      usageLimit: "100",
      perCustomerLimit: "1",
    });
    expect(d.amountMinor).toBe(24950);
    expect(discountDbValue(d)).toBe(249.5);
    expect(d.minSubtotalMinor).toBe(149900);
    expect(d.startsAt).toBe("2026-10-01T03:30:00.000Z");
    expect(d.endsAt).toBe("2026-10-05T18:29:00.000Z");
    expect(d.usageLimit).toBe(100);
    expect(d.perCustomerLimit).toBe(1);
    expect(d.status).toBe("disabled");
    expect(d.maxDiscountMinor).toBeNull();
  });

  it("supports automatic discounts without a code", () => {
    const d = schema.parse({ title: "Free ship", method: "automatic", type: "free_shipping", minSubtotal: "999", enabled: "on" });
    expect(d.automatic).toBe(true);
    expect(d.code).toBeNull();
    expect(discountDbValue(d)).toBe(0);
  });

  it("builds buy-x-get-y config", () => {
    const d = schema.parse({ title: "B2G1", code: "B2G1", type: "buy_x_get_y", buyQuantity: "2", getQuantity: "1", getPercent: "100", maxDiscount: "1000" });
    expect(d.config).toEqual({ buy_quantity: 2, get_quantity: 1, get_percent: 100 });
    expect(d.maxDiscountMinor).toBe(100000);
  });

  it("keeps only the relevant target ids", () => {
    const d = schema.parse({ title: "x", code: "ABC", type: "percentage", percent: "5", appliesTo: "products", productIds: [P1, P1], collectionIds: [P1] });
    expect(d.productIds).toEqual([P1]);
    expect(d.collectionIds).toEqual([]);
  });

  it("reports field errors mirroring DB checks", () => {
    expect(errors({ title: "x", type: "percentage", percent: "20" }).code).toBe("Enter a discount code");
    expect(errors({ title: "x", code: "a!", type: "percentage", percent: "20" }).code).toMatch(/3–40/);
    expect(errors({ title: "x", code: "ABC", type: "percentage", percent: "120" }).percent).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "percentage", percent: "12.5" }).percent).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "fixed_amount" }).amount).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "fixed_amount", amount: "abc" }).amount).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "percentage", percent: "5", appliesTo: "collections" }).collectionIds).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "percentage", percent: "5", startsAt: "2026-10-05T00:00", endsAt: "2026-10-01T00:00" }).endsAt).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "percentage", percent: "5", usageLimit: "0" }).usageLimit).toBeDefined();
    expect(errors({ code: "ABC", type: "percentage", percent: "5" }).title).toBeDefined();
    expect(errors({ title: "x", code: "ABC", type: "mystery" }).type).toBeDefined();
  });
});

describe("discountStatus / describeDiscount", () => {
  const base = { status: "active", starts_at: "2026-09-01T00:00:00Z", ends_at: null, usage_limit: null, usage_count: 0 };
  it("derives the display status", () => {
    expect(discountStatus(base, NOW)).toBe("active");
    expect(discountStatus({ ...base, status: "disabled" }, NOW)).toBe("disabled");
    expect(discountStatus({ ...base, starts_at: "2026-10-01T00:00:00Z" }, NOW)).toBe("scheduled");
    expect(discountStatus({ ...base, ends_at: "2026-09-10T00:00:00Z" }, NOW)).toBe("expired");
    expect(discountStatus({ ...base, usage_limit: 5, usage_count: 5 }, NOW)).toBe("exhausted");
  });

  it("describes discounts", () => {
    const fmt = (m: number) => formatMoney(m);
    expect(describeDiscount({ type: "percentage", value: 20, min_subtotal: 999, max_discount: 500, config: {} }, fmt)).toBe("20% off · min ₹999 · up to ₹500");
    expect(describeDiscount({ type: "fixed_amount", value: 249.5, min_subtotal: 0, max_discount: null, config: {} }, fmt)).toBe("₹249.50 off");
    expect(describeDiscount({ type: "buy_x_get_y", value: 0, min_subtotal: 0, max_discount: null, config: { buy_quantity: 2, get_quantity: 1, get_percent: 50 } }, fmt)).toBe("Buy 2 get 1 at 50% off");
  });
});
