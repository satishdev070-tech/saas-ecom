import { describe, expect, it } from "vitest";
import { builtInDates, builtInDatesBetween, buildUtmLink, istDayKey, istWeekRange, parseIstInput, pillarMix } from "@/features/social/planner";
import { overallStatus } from "@/features/social/compose";

const on = (year: number, title: string) => builtInDates(year).find((d) => d.title === title)?.onDate;

describe("built-in marketing dates", () => {
  it("has the fixed-date occasions, all built-in and sorted", () => {
    const d = builtInDates(2026);
    expect(d.map((x) => x.onDate)).toEqual([...d.map((x) => x.onDate)].sort());
    expect(d.every((x) => x.builtIn && x.id === null)).toBe(true);
    expect(on(2026, "Republic Day")).toBe("2026-01-26");
    expect(on(2026, "Independence Day")).toBe("2026-08-15");
    expect(on(2026, "Gandhi Jayanti")).toBe("2026-10-02");
    expect(on(2026, "Christmas")).toBe("2026-12-25");
    expect(d.some((x) => /diwali|holi|eid/i.test(x.title))).toBe(false);
  });

  it("computes Mother's Day, Father's Day and Black Friday", () => {
    expect(on(2026, "Mother's Day")).toBe("2026-05-10");
    expect(on(2025, "Mother's Day")).toBe("2025-05-11");
    expect(on(2026, "Father's Day")).toBe("2026-06-21");
    expect(on(2025, "Father's Day")).toBe("2025-06-15");
    expect(on(2026, "Black Friday")).toBe("2026-11-27");
    expect(on(2025, "Black Friday")).toBe("2025-11-28");
    expect(on(2024, "Black Friday")).toBe("2024-11-29");
  });

  it("filters a range across years", () => {
    expect(builtInDatesBetween("2026-12-20", "2027-01-31").map((d) => d.title)).toEqual(["Christmas", "New Year's Day", "Republic Day"]);
  });
});

describe("IST helpers", () => {
  it("groups by IST calendar day", () => {
    expect(istDayKey("2026-10-01T18:29:00Z")).toBe("2026-10-01");
    expect(istDayKey("2026-10-01T18:30:00Z")).toBe("2026-10-02");
  });

  it("parses local IST input and ISO", () => {
    expect(new Date(parseIstInput("2026-10-02T09:30")).toISOString()).toBe("2026-10-02T04:00:00.000Z");
    expect(parseIstInput("2026-10-02T04:00:00Z")).toBe(Date.parse("2026-10-02T04:00:00Z"));
    expect(parseIstInput("nope")).toBeNaN();
  });

  it("returns the Monday-to-Monday IST week", () => {
    // Friday 2 Oct 2026, 10:00 IST
    expect(istWeekRange(new Date("2026-10-02T04:30:00Z"))).toEqual({ from: "2026-09-27T18:30:00.000Z", to: "2026-10-04T18:30:00.000Z" });
  });
});

describe("pillar mix and links", () => {
  it("counts posts per pillar, ignoring unset", () => {
    expect(pillarMix([{ pillar: "product" }, { pillar: "offer" }, { pillar: "product" }, { pillar: null }])).toEqual({ product: 2, offer: 1 });
  });

  it("builds a tracked product link", () => {
    expect(buildUtmLink("https://shop.example.in/", "silk kurta")).toBe("https://shop.example.in/products/silk%20kurta?utm_source=social&utm_medium=organic&utm_campaign=planner");
  });
});

describe("overallStatus with planned channels", () => {
  const at = "2026-10-02T00:00:00Z";
  it("ignores manual channels", () => {
    expect(overallStatus(["facebook", "whatsapp", "x"], { facebook: { ok: true, at } })).toBe("published");
    expect(overallStatus(["instagram", "linkedin"], { instagram: { ok: false, error: "x", at } })).toBe("failed");
    expect(overallStatus(["whatsapp"], {})).toBe("failed");
  });
});
