import { describe, expect, it } from "vitest";
import { discountPercent, formatMoney, toDecimalString, toMinor } from "@/lib/money";

describe("money", () => {
  it("parses Postgres numeric strings into paise", () => {
    expect(toMinor("1299.00")).toBe(129900);
    expect(toMinor("1299.5")).toBe(129950);
    expect(toMinor("0.07")).toBe(7);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor("-5.10")).toBe(-510);
  });

  it("rejects malformed amounts", () => {
    expect(() => toMinor("12.345")).toThrow();
    expect(() => toMinor("abc")).toThrow();
  });

  it("round-trips to decimal strings", () => {
    expect(toDecimalString(129950)).toBe("1299.50");
    expect(toDecimalString(7)).toBe("0.07");
    expect(toDecimalString(-510)).toBe("-5.10");
  });

  it("formats INR with Indian grouping", () => {
    expect(formatMoney(12345600)).toBe("₹1,23,456");
    expect(formatMoney(129950)).toBe("₹1,299.50");
  });

  it("never overstates discounts", () => {
    expect(discountPercent(99900, 199900)).toBe(50); // 50.02% -> 50
    expect(discountPercent(66700, 100000)).toBe(33); // 33.3% -> 33
    expect(discountPercent(100000, 90000)).toBe(0);
    expect(discountPercent(100000, null)).toBe(0);
  });
});
