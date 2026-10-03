import { describe, expect, it } from "vitest";
import {
  allocateLargestRemainder,
  computeTax,
  divRoundHalfUp,
  priceCart,
  quoteShipping,
  taxRateForUnitPrice,
  totalsAreConsistent,
  type DiscountDefinition,
  type PricingInput,
  type ShippingRateDefinition,
} from "@/features/checkout/pricing";

const TAX = { pricesIncludeTax: true, rules: [{ maxUnitPrice: 250_000, rate: 5 }, { rate: 18 }] };
const COD = { enabled: true, fee: 0, minOrder: 0, maxOrder: 1_000_000 };

const rate = (over: Partial<ShippingRateDefinition> = {}): ShippingRateDefinition => ({
  id: "std",
  name: "Standard",
  price: 9_900,
  minSubtotal: 0,
  maxSubtotal: 149_999,
  minWeightGrams: 0,
  maxWeightGrams: null,
  pincodePrefixes: [],
  estimatedDaysMin: 3,
  estimatedDaysMax: 6,
  codAllowed: true,
  position: 1,
  ...over,
});
const RATES = [rate(), rate({ id: "free", name: "Free shipping", price: 0, minSubtotal: 150_000, maxSubtotal: null, position: 2 })];

const line = (key: string, unitPrice: number, quantity = 1, extra: Partial<PricingInput["lines"][number]> = {}) => ({
  key,
  productId: `p-${key}`,
  unitPrice,
  quantity,
  weightGrams: 500,
  ...extra,
});

const discount = (over: Partial<DiscountDefinition>): DiscountDefinition => ({
  id: "d1",
  code: "CODE",
  type: "percentage",
  value: 10,
  appliesTo: "all",
  minSubtotal: 0,
  maxDiscount: null,
  ...over,
});

function price(over: Partial<PricingInput>) {
  const result = priceCart({ lines: [], shippingRates: RATES, cod: COD, tax: TAX, ...over });
  expect(totalsAreConsistent(result)).toBe(true);
  return result;
}

describe("integer helpers", () => {
  it("divRoundHalfUp rounds half up", () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(4, 3)).toBe(1);
    expect(divRoundHalfUp(0, 7)).toBe(0);
  });

  it("allocates by largest remainder and always sums exactly", () => {
    expect(allocateLargestRemainder(100, [100, 100, 100])).toEqual([34, 33, 33]);
    expect(allocateLargestRemainder(1, [1, 1])).toEqual([1, 0]);
    expect(allocateLargestRemainder(0, [5, 5])).toEqual([0, 0]);
    expect(() => allocateLargestRemainder(11, [5, 5])).toThrow(RangeError);
    // fuzz: parts sum to total and never exceed their weight
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let t = 0; t < 500; t++) {
      const weights = Array.from({ length: 1 + rnd(8) }, () => rnd(500_000));
      const sum = weights.reduce((a, b) => a + b, 0);
      const total = sum === 0 ? 0 : rnd(sum + 1);
      const parts = allocateLargestRemainder(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => expect(p).toBeLessThanOrEqual(weights[i]!));
    }
  });

  it("handles very large carts without precision loss", () => {
    const parts = allocateLargestRemainder(9_999_999_999, [9_999_999_999, 7_777_777_777]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_999_999_999);
  });
});

describe("tax", () => {
  it("picks the slab by unit price", () => {
    expect(taxRateForUnitPrice(250_000, TAX.rules)).toBe(5);
    expect(taxRateForUnitPrice(250_001, TAX.rules)).toBe(18);
    expect(taxRateForUnitPrice(100, [])).toBe(0);
  });

  it("extracts inclusive tax and adds exclusive tax", () => {
    expect(computeTax(299_800, 5, true)).toBe(14_276); // 2998 incl. 5% -> 142.76
    expect(computeTax(100_000, 18, false)).toBe(18_000);
    expect(computeTax(100_000, 2.5, false)).toBe(2_500);
    expect(computeTax(0, 18, true)).toBe(0);
  });
});

describe("priceCart basics", () => {
  it("prices a simple inclusive-tax cart with paid shipping below the threshold", () => {
    const r = price({ lines: [line("a", 149_900, 1)] });
    expect(r).toMatchObject({ subtotal: 149_900, discountTotal: 0, shippingTotal: 9_900, codFee: 0, grandTotal: 159_800, itemCount: 1 });
    expect(r.lines[0]).toMatchObject({ taxRate: 5, tax: 7_138, total: 149_900 });
    expect(r.taxTotal).toBe(7_138);
    expect(r.shipping.selected?.id).toBe("std");
  });

  it("gives free shipping at the threshold and picks the cheapest rate", () => {
    const r = price({ lines: [line("a", 149_900, 2)] });
    expect(r.shippingTotal).toBe(0);
    expect(r.shipping.selected?.id).toBe("free");
    expect(r.grandTotal).toBe(299_800);
    expect(r.taxTotal).toBe(14_276);
  });

  it("honours an explicitly selected rate when it is available and ignores unknown ids", () => {
    const rates = [rate({ id: "exp", name: "Express", price: 19_900, maxSubtotal: null }), rate({ id: "std", maxSubtotal: null })];
    expect(price({ lines: [line("a", 10_000)], shippingRates: rates, selectedShippingRateId: "exp" }).shippingTotal).toBe(19_900);
    expect(price({ lines: [line("a", 10_000)], shippingRates: rates, selectedShippingRateId: "nope" }).shippingTotal).toBe(9_900);
  });

  it("adds exclusive tax to the grand total", () => {
    const r = price({ lines: [line("a", 300_000)], tax: { pricesIncludeTax: false, rules: TAX.rules } });
    expect(r.lines[0]!.taxRate).toBe(18);
    expect(r.taxTotal).toBe(54_000);
    expect(r.grandTotal).toBe(300_000 + 54_000);
  });

  it("returns zeros for an empty cart", () => {
    const r = price({ lines: [] });
    expect(r).toMatchObject({ subtotal: 0, grandTotal: 0, shippingTotal: 0, itemCount: 0 });
    expect(r.cod.available).toBe(false);
  });

  it("rejects fractional or negative money", () => {
    expect(() => priceCart({ lines: [line("a", 10.5)], shippingRates: [], cod: COD, tax: TAX })).toThrow(RangeError);
    expect(() => priceCart({ lines: [line("a", 100, 0)], shippingRates: [], cod: COD, tax: TAX })).toThrow(RangeError);
  });
});

describe("discounts", () => {
  it("percentage rounds down and is capped by max_discount", () => {
    const r = price({ lines: [line("a", 999)], discount: discount({ value: 10 }) });
    expect(r.discountTotal).toBe(99);
    const capped = price({ lines: [line("a", 900_000)], discount: discount({ value: 10, maxDiscount: 50_000 }) });
    expect(capped.discountTotal).toBe(50_000);
    expect(capped.discount).toMatchObject({ status: "applied", amount: 50_000 });
  });

  it("splits an order discount across lines so the parts sum exactly", () => {
    const r = price({ lines: [line("a", 100), line("b", 100), line("c", 100)], discount: discount({ type: "fixed_amount", value: 100 }) });
    expect(r.lines.map((l) => l.discount)).toEqual([34, 33, 33]);
    expect(r.discountTotal).toBe(100);
  });

  it("never discounts more than the eligible subtotal", () => {
    const r = price({ lines: [line("a", 5_000)], discount: discount({ type: "fixed_amount", value: 100_000 }) });
    expect(r.discountTotal).toBe(5_000);
    expect(r.lines[0]!.total).toBe(0);
    expect(r.grandTotal).toBe(r.shippingTotal);
  });

  it("enforces min_subtotal against the pre-discount subtotal", () => {
    const r = price({ lines: [line("a", 99_800)], discount: discount({ minSubtotal: 99_900 }) });
    expect(r.discountTotal).toBe(0);
    expect(r.discount).toMatchObject({ status: "rejected", reason: "min_subtotal" });
    expect(price({ lines: [line("a", 99_900)], discount: discount({ minSubtotal: 99_900 }) }).discountTotal).toBe(9_990);
  });

  it("applies product- and collection-scoped discounts to eligible lines only", () => {
    const byProduct = price({ lines: [line("a", 10_000), line("b", 20_000)], discount: discount({ appliesTo: "products", productIds: ["p-b"], value: 50 }) });
    expect(byProduct.lines.map((l) => l.discount)).toEqual([0, 10_000]);
    const byCollection = price({
      lines: [line("a", 10_000, 1, { collectionIds: ["sale"] }), line("b", 20_000, 1, { collectionIds: ["new"] })],
      discount: discount({ appliesTo: "collections", collectionIds: ["sale"], type: "fixed_amount", value: 3_000 }),
    });
    expect(byCollection.lines.map((l) => l.discount)).toEqual([3_000, 0]);
    const none = price({ lines: [line("a", 10_000)], discount: discount({ appliesTo: "products", productIds: ["zzz"] }) });
    expect(none.discount).toMatchObject({ status: "rejected", reason: "not_applicable" });
  });

  it("buy X get Y makes the cheapest eligible units free", () => {
    const d = discount({ type: "buy_x_get_y", value: 0, buyQuantity: 2, getQuantity: 1 });
    const r = price({ lines: [line("a", 100_000), line("b", 80_000), line("c", 50_000)], discount: d });
    expect(r.lines.map((l) => l.discount)).toEqual([0, 0, 50_000]);
    // 7 units -> 2 complete groups -> the 2 cheapest units are free
    const many = price({ lines: [line("a", 100_000, 4), line("b", 30_000, 3)], discount: d });
    expect(many.lines.map((l) => l.discount)).toEqual([0, 60_000]);
    // incomplete group -> nothing
    expect(price({ lines: [line("a", 100_000, 2)], discount: d }).discount.status).toBe("rejected");
  });

  it("buy X get Y supports partial percentages and caps", () => {
    const half = discount({ type: "buy_x_get_y", value: 0, buyQuantity: 1, getQuantity: 1, getPercent: 50 });
    expect(price({ lines: [line("a", 10_001, 2)], discount: half }).discountTotal).toBe(5_000);
    const capped = discount({ type: "buy_x_get_y", value: 0, buyQuantity: 1, getQuantity: 1, maxDiscount: 11_000 });
    const r = price({ lines: [line("a", 30_000), line("b", 10_000), line("c", 12_000), line("d", 40_000)], discount: capped });
    // uncapped: b + c free (22_000); capped to 11_000 and split proportionally over the free units' lines
    expect(r.discountTotal).toBe(11_000);
    expect(r.lines.map((l) => l.discount)).toEqual([0, 5_000, 6_000, 0]);
  });

  it("free-shipping discounts zero the shipping but not the lines", () => {
    const r = price({ lines: [line("a", 50_000)], discount: discount({ type: "free_shipping", value: 0 }) });
    expect(r.discountTotal).toBe(0);
    expect(r.shippingTotal).toBe(0);
    expect(r.shipping.selected?.originalPrice).toBe(9_900);
    expect(r.discount).toMatchObject({ status: "applied", freeShipping: true });
  });

  it("uses the subtotal after discounts for shipping thresholds", () => {
    const r = price({ lines: [line("a", 160_000)], discount: discount({ type: "fixed_amount", value: 20_000 }) });
    expect(r.shippingTotal).toBe(9_900);
  });

  it("picks the tax slab from the discounted unit price", () => {
    const r = price({ lines: [line("a", 260_000)], discount: discount({ value: 10 }) });
    expect(r.lines[0]!.taxRate).toBe(5); // 2340 after discount
    const undiscounted = price({ lines: [line("a", 260_000)] });
    expect(undiscounted.lines[0]!.taxRate).toBe(18);
  });
});

describe("shipping & PIN rules", () => {
  it("marks undeliverable PINs as not serviceable (longest prefix wins)", () => {
    const pincodeRules = [
      { prefix: "79", deliverable: false, codAllowed: false, extraDays: 0 },
      { prefix: "791", deliverable: true, codAllowed: false, extraDays: 3 },
    ];
    const blocked = price({ lines: [line("a", 10_000)], pincode: "790001", pincodeRules });
    expect(blocked.shipping.serviceable).toBe(false);
    expect(blocked.shippingTotal).toBe(0);
    const slow = price({ lines: [line("a", 10_000)], pincode: "791001", pincodeRules });
    expect(slow.shipping.serviceable).toBe(true);
    expect(slow.shipping.selected).toMatchObject({ estimatedDaysMin: 6, estimatedDaysMax: 9, codAllowed: false });
    expect(slow.cod.available).toBe(false);
  });

  it("only offers region rates when the PIN matches", () => {
    const rates = [rate({ id: "raj", name: "Rajasthan", price: 4_900, maxSubtotal: null, pincodePrefixes: ["30", "31", "32", "33", "34"] }), rate({ id: "std", maxSubtotal: null })];
    expect(quoteShipping({ rates, basisSubtotal: 10_000, weightGrams: 500, pincode: "302001" }).selected?.id).toBe("raj");
    expect(quoteShipping({ rates, basisSubtotal: 10_000, weightGrams: 500, pincode: "110001" }).selected?.id).toBe("std");
    expect(quoteShipping({ rates, basisSubtotal: 10_000, weightGrams: 500 }).rates.map((r) => r.id)).toEqual(["std"]);
  });

  it("respects weight bands", () => {
    const rates = [rate({ id: "light", maxWeightGrams: 1_000, maxSubtotal: null }), rate({ id: "heavy", price: 19_900, minWeightGrams: 1_001, maxSubtotal: null })];
    expect(price({ lines: [line("a", 10_000, 2)], shippingRates: rates }).shipping.selected?.id).toBe("light");
    expect(price({ lines: [line("a", 10_000, 3)], shippingRates: rates }).shipping.selected?.id).toBe("heavy");
  });

  it("is not serviceable when no rate matches", () => {
    expect(price({ lines: [line("a", 10_000)], shippingRates: [] }).shipping.serviceable).toBe(false);
  });
});

describe("cash on delivery", () => {
  it("adds the COD fee only when COD is chosen and available", () => {
    const cod = { enabled: true, fee: 4_900, minOrder: 0, maxOrder: 1_000_000 };
    const r = price({ lines: [line("a", 50_000)], cod, paymentMethod: "cod" });
    expect(r.codFee).toBe(4_900);
    expect(r.grandTotal).toBe(50_000 + 9_900 + 4_900);
    expect(price({ lines: [line("a", 50_000)], cod, paymentMethod: "online" }).codFee).toBe(0);
  });

  it("checks min/max order value and the enabled flag", () => {
    const cod = { enabled: true, fee: 4_900, minOrder: 50_000, maxOrder: 1_000_000 };
    expect(price({ lines: [line("a", 30_000)], cod, paymentMethod: "cod" })).toMatchObject({ codFee: 0, cod: { available: false } });
    expect(price({ lines: [line("a", 1_100_000)], cod }).cod.available).toBe(false);
    expect(price({ lines: [line("a", 60_000)], cod: { ...cod, enabled: false } }).cod.reason).toMatch(/isn't offered/);
    expect(price({ lines: [line("a", 60_000)], cod: { ...cod, maxOrder: null } }).cod.available).toBe(true);
  });

  it("is unavailable when the selected rate forbids it", () => {
    const rates = [rate({ codAllowed: false, maxSubtotal: null })];
    expect(price({ lines: [line("a", 10_000)], shippingRates: rates }).cod.available).toBe(false);
  });
});

describe("invariants", () => {
  it("holds the orders CHECK for many random carts", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const types: DiscountDefinition["type"][] = ["percentage", "fixed_amount", "free_shipping", "buy_x_get_y"];
    for (let t = 0; t < 400; t++) {
      const lines = Array.from({ length: 1 + rnd(6) }, (_, i) => line(`l${i}`, 1 + rnd(600_000), 1 + rnd(5)));
      const type = types[rnd(4)]!;
      const d = rnd(3) === 0 ? null : discount({ type, value: type === "percentage" ? rnd(101) : rnd(200_000), maxDiscount: rnd(2) ? null : 1 + rnd(100_000), buyQuantity: 1 + rnd(3), getQuantity: 1 + rnd(2) });
      const r = priceCart({
        lines,
        discount: d,
        shippingRates: RATES,
        cod: { enabled: true, fee: rnd(10_000), minOrder: 0, maxOrder: null },
        paymentMethod: rnd(2) ? "cod" : "online",
        tax: { pricesIncludeTax: rnd(2) === 0, rules: TAX.rules },
      });
      expect(totalsAreConsistent(r)).toBe(true);
    }
  });
});
