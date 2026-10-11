import { describe, expect, it } from "vitest";
import { code128B, code128Bars } from "@/features/orders-admin/print/code128";
import { parseDocs } from "@/features/orders-admin/print/load";
import { discountPercent, priceFromDiscount } from "@/features/catalog/discount";
import { activeFestive, festiveCampaignSchema, festiveStatus, istDate, parseFestiveSettings, type FestiveCampaign } from "@/features/storefront/festive";
import { parseThankYouNote } from "@/features/checkout/options";

describe("Code 128 barcode (shipping labels)", () => {
  it("encodes subset B with start, checksum and stop", () => {
    const w = code128B("PAL-1042")!;
    // start + 8 chars + checksum = 10 symbols × 6 elements, + 7-element stop
    expect(w).toHaveLength(10 * 6 + 7);
    // every symbol is 11 modules wide, stop is 13
    for (let i = 0; i < 10; i++) expect(w.slice(i * 6, i * 6 + 6).reduce((a, b) => a + b, 0)).toBe(11);
    expect(w.slice(60).reduce((a, b) => a + b, 0)).toBe(13);
    // known checksum: Code 128B "PAL-1042" -> start 104 ... value check via first symbol pattern
    expect(w.slice(0, 6).join("")).toBe("211214");
  });
  it("rejects characters outside printable ASCII and adds quiet zones", () => {
    expect(code128B("नमस्ते")).toBeNull();
    expect(code128B("")).toBeNull();
    const bars = code128Bars("#12")!;
    expect(bars.width).toBe(10 + 5 * 11 + 13 + 10);
    expect(bars.bars[0]!.x).toBe(10);
  });
});

describe("print documents query", () => {
  it("keeps known documents in a fixed order and defaults to all", () => {
    expect(parseDocs("label,invoice,bogus")).toEqual(["invoice", "label"]);
    expect(parseDocs(undefined)).toEqual(["invoice", "slip", "label", "thanks"]);
  });
  it("reads the seller's thank-you note", () => {
    expect(parseThankYouNote({ thank_you_note: "  Hi {name}!  " })).toBe("Hi {name}!");
    expect(parseThankYouNote({})).toBeNull();
  });
});

describe("% off MRP", () => {
  it("shows the discount and sets price from a percentage", () => {
    expect(discountPercent("699", "999")).toBe("30");
    expect(discountPercent("999", "999")).toBe("");
    expect(discountPercent("699", "")).toBe("");
    expect(priceFromDiscount("999", "30")).toBe("699");
    expect(priceFromDiscount("1,499.00", "20")).toBe("1199");
    expect(priceFromDiscount("999", "100")).toBeNull();
    expect(priceFromDiscount("", "10")).toBeNull();
    expect(priceFromDiscount("999", "abc")).toBeNull();
  });
});

describe("festive vibes", () => {
  const base: FestiveCampaign = { id: "navratri26", preset: "navratri", start: "2026-10-11", end: "2026-10-20", message: "", link: "", banner: true, garland: true, petals: false };
  it("runs only between its dates (inclusive)", () => {
    expect(activeFestive([base], "2026-10-10")).toBeNull();
    expect(activeFestive([base], "2026-10-11")?.id).toBe("navratri26");
    expect(activeFestive([base], "2026-10-20")?.id).toBe("navratri26");
    expect(activeFestive([base], "2026-10-21")).toBeNull();
    expect(festiveStatus(base, "2026-10-01")).toBe("scheduled");
    expect(festiveStatus(base, "2026-10-25")).toBe("ended");
  });
  it("prefers the most recently started campaign on overlap", () => {
    const diwali = { ...base, id: "diwali2026", preset: "diwali" as const, start: "2026-10-18", end: "2026-10-25" };
    expect(activeFestive([base, diwali], "2026-10-19")?.id).toBe("diwali2026");
  });
  it("validates input and drops malformed stored entries", () => {
    expect(festiveCampaignSchema.safeParse({ ...base, end: "2026-10-01" }).success).toBe(false);
    expect(festiveCampaignSchema.safeParse({ ...base, link: "https://evil.example" }).success).toBe(false);
    expect(parseFestiveSettings({ campaigns: [base, { id: "x" }, "junk"] })).toEqual([base]);
    expect(parseFestiveSettings(null)).toEqual([]);
  });
  it("uses the India date", () => {
    expect(istDate(new Date("2026-10-10T20:00:00Z"))).toBe("2026-10-11");
  });
});
