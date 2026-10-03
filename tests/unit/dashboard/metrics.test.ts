import { describe, expect, it } from "vitest";
import { conversionFunnel, countsAsSale, dailySeries, percentChange, salesSummary, topProducts, trafficByPath, zeroFillDays } from "@/features/analytics/metrics";
import { addDays, eachDay, istDateKey, istDayStart, istLocalToIso, isoToIstLocal, resolveDateRange } from "@/features/analytics/dates";

// 2026-09-24 12:00 IST
const NOW = new Date("2026-09-24T06:30:00.000Z");

describe("IST date helpers", () => {
  it("buckets by IST calendar day", () => {
    expect(istDateKey("2026-09-23T18:29:59.000Z")).toBe("2026-09-23");
    expect(istDateKey("2026-09-23T18:30:00.000Z")).toBe("2026-09-24");
    expect(istDayStart("2026-09-24").toISOString()).toBe("2026-09-23T18:30:00.000Z");
  });

  it("adds days and enumerates ranges across month ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(eachDay("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("round-trips datetime-local values as IST", () => {
    expect(istLocalToIso("2026-10-01T09:30")).toBe("2026-10-01T04:00:00.000Z");
    expect(isoToIstLocal("2026-10-01T04:00:00.000Z")).toBe("2026-10-01T09:30");
    expect(istLocalToIso("nonsense")).toBeNull();
    expect(istLocalToIso("")).toBeNull();
  });

  it("resolves presets and clamps custom ranges", () => {
    const r30 = resolveDateRange({}, NOW);
    expect(r30.preset).toBe("30d");
    expect(r30.fromKey).toBe("2026-08-26");
    expect(r30.toKey).toBe("2026-09-24");
    expect(r30.days).toBe(30);
    expect(r30.toIsoExclusive).toBe("2026-09-24T18:30:00.000Z");

    const today = resolveDateRange({ range: "today" }, NOW);
    expect(today.days).toBe(1);

    const custom = resolveDateRange({ range: "custom", from: "2026-09-01", to: "2030-01-01" }, NOW);
    expect(custom.toKey).toBe("2026-09-24");
    expect(custom.fromKey).toBe("2026-09-01");

    const long = resolveDateRange({ range: "custom", from: "2020-01-01", to: "2026-09-24" }, NOW);
    expect(long.days).toBe(366);

    expect(resolveDateRange({ range: "custom", from: "2026-09-10", to: "2026-09-01" }, NOW).preset).toBe("30d");
    expect(resolveDateRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, NOW).preset).toBe("30d");
    expect(resolveDateRange({ range: "evil" }, NOW).preset).toBe("30d");
  });
});

describe("salesSummary", () => {
  const orders = [
    { grand_total: 1000.5, status: "confirmed", placed_at: "2026-09-24T05:00:00Z" }, // today
    { grand_total: 499, status: "completed", placed_at: "2026-09-23T18:45:00Z" }, // today (00:15 IST)
    { grand_total: 999, status: "cancelled", placed_at: "2026-09-24T04:00:00Z" }, // excluded
    { grand_total: 750, status: "pending", placed_at: "2026-09-24T04:00:00Z" }, // awaiting payment: excluded
    { grand_total: 200.1, status: "confirmed", placed_at: "2026-09-20T10:00:00Z" }, // 7d
    { grand_total: 0.2, status: "confirmed", placed_at: "2026-09-17T18:29:00Z" }, // 2026-09-17 23:59 IST, outside 7d
    { grand_total: 300, status: "confirmed", placed_at: "2026-08-26T00:00:00Z" }, // 30d (first day)
    { grand_total: 300, status: "confirmed", placed_at: "2026-08-25T18:00:00Z" }, // 2026-08-25 IST: outside 30d
  ];

  it("sums in paise, excludes cancelled and unpaid, and computes AOV", () => {
    const s = salesSummary(orders, NOW);
    expect(s.today).toEqual({ revenueMinor: 149950, orders: 2, aovMinor: 74975 });
    expect(s.last7.revenueMinor).toBe(149950 + 20010);
    expect(s.last7.orders).toBe(3);
    expect(s.last30.revenueMinor).toBe(149950 + 20010 + 20 + 30000);
    expect(s.last30.orders).toBe(5);
  });

  it("avoids float drift", () => {
    const many = Array.from({ length: 10 }, () => ({ grand_total: 0.1, status: "confirmed", placed_at: "2026-09-24T05:00:00Z" }));
    expect(salesSummary(many, NOW).today.revenueMinor).toBe(100);
  });

  it("returns zeros with no orders", () => {
    expect(salesSummary([], NOW).last30).toEqual({ revenueMinor: 0, orders: 0, aovMinor: 0 });
  });

  it("countsAsSale", () => {
    expect(countsAsSale("confirmed")).toBe(true);
    expect(countsAsSale("completed")).toBe(true);
    expect(countsAsSale("cancelled")).toBe(false);
    expect(countsAsSale("pending")).toBe(false);
  });
});

describe("dailySeries", () => {
  it("zero-fills days and buckets in IST", () => {
    const s = dailySeries(
      [
        { grand_total: 100, status: "confirmed", placed_at: "2026-09-22T19:00:00Z" }, // 23rd IST
        { grand_total: 50, status: "confirmed", placed_at: "2026-09-23T10:00:00Z" },
        { grand_total: 70, status: "cancelled", placed_at: "2026-09-23T10:00:00Z" },
        { grand_total: 70, status: "confirmed", placed_at: "2026-10-23T10:00:00Z" }, // out of range
      ],
      "2026-09-22",
      "2026-09-24",
    );
    expect(s).toEqual([
      { date: "2026-09-22", revenueMinor: 0, orders: 0 },
      { date: "2026-09-23", revenueMinor: 15000, orders: 2 },
      { date: "2026-09-24", revenueMinor: 0, orders: 0 },
    ]);
  });
});

describe("topProducts", () => {
  it("aggregates by product and sorts by revenue", () => {
    const top = topProducts([
      { product_id: "a", product_title: "Kurta", quantity: 2, line_total: 1998 },
      { product_id: "b", product_title: "Saree", quantity: 1, line_total: 4999 },
      { product_id: "a", product_title: "Kurta", quantity: 1, line_total: 999 },
      { product_id: null, product_title: "Old item", quantity: 1, line_total: 10 },
    ]);
    expect(top.map((t) => [t.title, t.units, t.revenueMinor])).toEqual([
      ["Saree", 1, 499900],
      ["Kurta", 3, 299700],
      ["Old item", 1, 1000],
    ]);
    expect(topProducts([], 5)).toEqual([]);
  });
});

describe("conversionFunnel", () => {
  it("counts distinct sessions per step with rates", () => {
    const ev = (event_name: string, session_id: string | null) => ({ event_name, session_id });
    const f = conversionFunnel([
      ev("page_view", "s1"),
      ev("page_view", "s1"),
      ev("page_view", "s2"),
      ev("page_view", "s3"),
      ev("page_view", "s4"),
      ev("product_view", "s1"),
      ev("product_view", "s2"),
      ev("add_to_cart", "s1"),
      ev("begin_checkout", "s1"),
      ev("purchase", "s1"),
      ev("search", "s9"),
    ]);
    expect(f.map((s) => s.sessions)).toEqual([4, 2, 1, 1, 1]);
    expect(f[0]!.fromPrevious).toBeNull();
    expect(f[1]!.fromPrevious).toBe(50);
    expect(f[4]!.fromStart).toBe(25);
  });

  it("handles no data without dividing by zero", () => {
    const f = conversionFunnel([]);
    expect(f.every((s) => s.sessions === 0)).toBe(true);
    expect(f[1]!.fromPrevious).toBeNull();
  });
});

describe("trafficByPath", () => {
  it("groups page views by path without query strings", () => {
    const t = trafficByPath([
      { event_name: "page_view", session_id: "a", path: "/products/kurta?utm=x" },
      { event_name: "page_view", session_id: "b", path: "/products/kurta" },
      { event_name: "page_view", session_id: "a", path: "/" },
      { event_name: "product_view", session_id: "a", path: "/products/kurta" },
      { event_name: "page_view", session_id: null, path: null },
    ]);
    expect(t[0]).toEqual({ path: "/products/kurta", views: 2, sessions: 2 });
    expect(t.find((x) => x.path === "(unknown)")?.views).toBe(1);
  });
});

describe("percentChange", () => {
  it("returns null without a baseline", () => {
    expect(percentChange(0, 10)).toBeNull();
    expect(percentChange(200, 250)).toBe(25);
    expect(percentChange(3, 2)).toBe(-33.3);
  });
});

describe("zeroFillDays", () => {
  it("spans the whole range, keeping reported days and zero-filling the rest", () => {
    const out = zeroFillDays([{ day: "2026-09-02", orders: 2, revenueMinor: 5000 }], "2026-09-01", "2026-09-03");
    expect(out).toEqual([
      { day: "2026-09-01", orders: 0, revenueMinor: 0 },
      { day: "2026-09-02", orders: 2, revenueMinor: 5000 },
      { day: "2026-09-03", orders: 0, revenueMinor: 0 },
    ]);
  });
  it("ignores days outside the range", () => {
    expect(zeroFillDays([{ day: "2026-08-01", orders: 1, revenueMinor: 1 }], "2026-09-01", "2026-09-01")).toEqual([{ day: "2026-09-01", orders: 0, revenueMinor: 0 }]);
  });
});
