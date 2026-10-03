import { describe, expect, it } from "vitest";
import { cardSizes } from "@/features/storefront/server/catalog";
import { splitAtPageContent } from "@/features/theme/render/split";
import { isMp4 } from "@/lib/storage/upload";
import { SECTION_DEFINITIONS, defaultSettings } from "@/features/theme/sections/definitions";
import { resolveThemeConfig } from "@/features/theme/schema/config";
import type { SectionInstance } from "@/features/theme/sections/types";

const sec = (type: string, id: string) => ({ id, type, settings: {}, visibility: { desktop: true, mobile: true } }) as unknown as SectionInstance;

describe("size chips on product cards", () => {
  const row = {
    product_options: [{ name: "Colour", position: 1 }, { name: "Size", position: 2 }],
    product_variants: [
      { id: "a", price: 1, compare_at_price: null, status: "active", position: 2, option1: "Blue", option2: "M" },
      { id: "b", price: 1, compare_at_price: null, status: "active", position: 1, option1: "Blue", option2: "S" },
      { id: "c", price: 1, compare_at_price: null, status: "active", position: 3, option1: "Red", option2: "M" },
      { id: "d", price: 1, compare_at_price: null, status: "archived", position: 4, option1: "Red", option2: "XL" },
    ],
  };
  it("lists sizes in variant order, merging colours, skipping inactive variants", () => {
    const stock = new Map([["a", { available: 0, inStock: false }], ["b", { available: 3, inStock: true }], ["c", { available: 2, inStock: true }]]);
    expect(cardSizes(row, stock)).toEqual([{ value: "S", inStock: true, variantId: "b" }, { value: "M", inStock: true, variantId: "c" }]);
  });
  it("marks a size sold out when no variant of it is in stock, and ignores products without a size option", () => {
    const stock = new Map([["a", { available: 0, inStock: false }], ["b", { available: 0, inStock: false }], ["c", { available: 0, inStock: false }]]);
    expect(cardSizes(row, stock).every((s) => !s.inStock)).toBe(true);
    expect(cardSizes({ product_options: [{ name: "Colour", position: 1 }], product_variants: row.product_variants }, stock)).toEqual([]);
  });
});

describe("PageContent marker", () => {
  it("splits a template around the marker", () => {
    const [before, after] = splitAtPageContent([sec("Marquee", "m1"), sec("PageContent", "p"), sec("TrustBadges", "t")]);
    expect(before.map((s) => s.id)).toEqual(["m1"]);
    expect(after.map((s) => s.id)).toEqual(["t"]);
  });
  it("puts everything after the content when there is no marker (existing stores unchanged)", () => {
    const [before, after] = splitAtPageContent([sec("Marquee", "m1"), sec("TrustBadges", "t")]);
    expect(before).toEqual([]);
    expect(after).toHaveLength(2);
  });
});

describe("MP4 upload check", () => {
  const box = (brand: string) => new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftyp"), ...Buffer.from(brand), 0, 0, 0, 0]);
  it("accepts MP4 brands and rejects QuickTime and other files", () => {
    expect(isMp4(box("isom"))).toBe(true);
    expect(isMp4(box("mp42"))).toBe(true);
    expect(isMp4(box("qt  "))).toBe(false);
    expect(isMp4(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isMp4(new Uint8Array(4))).toBe(false);
  });
});

describe("new sections and options", () => {
  it("have valid defaults and survive config validation", () => {
    for (const t of ["Marquee", "VideoShop", "PageContent"] as const) expect(() => SECTION_DEFINITIONS[t].schema.parse(defaultSettings(t))).not.toThrow();
    expect(defaultSettings("TrustBadges").layout).toBe("grid");
    expect(defaultSettings("AnnouncementBar").mode).toBe("static");
    expect(defaultSettings("Header").menuStyle).toBe("bar");
  });
  it("rejects foreign or non-video URLs in shoppable videos", () => {
    const bad = SECTION_DEFINITIONS.VideoShop.schema.safeParse({ items: [{ videoUrl: "https://evil.example/x.mp4" }] });
    expect(bad.success).toBe(false);
    const ok = SECTION_DEFINITIONS.VideoShop.schema.safeParse({ items: [{ videoUrl: "tenant/10000000-0000-4000-a000-00000000000a/theme/a.mp4" }] });
    expect(ok.success).toBe(true);
  });
  it("keeps only one PageContent per template and allows it only on collection/product pages", () => {
    const cfg = resolveThemeConfig({ templates: { home: [{ id: "pc-home", type: "PageContent", settings: {} }], collection: [{ id: "pc-a", type: "PageContent", settings: {} }, { id: "pc-b", type: "PageContent", settings: {} }] } });
    expect(cfg.config.templates.home.some((s) => s.type === "PageContent")).toBe(false);
    expect(cfg.config.templates.collection.filter((s) => s.type === "PageContent")).toHaveLength(1);
  });
});
