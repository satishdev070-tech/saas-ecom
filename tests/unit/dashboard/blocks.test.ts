import { describe, expect, it } from "vitest";
import { blocksBelongToTenant, blocksToPlainText, contentBlocksSchema, isSafeHref, parseStoredBlocks } from "@/features/content/blocks";

const T = "10000000-0000-4000-a000-00000000000a";
const OTHER = "10000000-0000-4000-a000-00000000000b";

describe("isSafeHref", () => {
  it.each([
    ["/collections/sale", true],
    ["/", true],
    ["https://instagram.com/aangan", true],
    ["//evil.com", false],
    ["/\\evil.com", false],
    ["javascript:alert(1)", false],
    ["http://insecure.com", false],
    ["data:text/html,hi", false],
    ["https://user:pw@evil.com", false],
    ["/path with space", false],
    ["", false],
    ["relative/path", false],
  ])("%s → %s", (href, ok) => {
    expect(isSafeHref(href)).toBe(ok);
  });
});

describe("contentBlocksSchema", () => {
  it("accepts every block type", () => {
    const blocks = [
      { type: "heading", level: 2, text: "Our story" },
      { type: "paragraph", text: "Hand block-printed in Jaipur." },
      { type: "image", path: `tenant/${T}/pages/abc-123.webp`, alt: "Artisan at work", caption: "Sanganer" },
      { type: "list", style: "number", items: ["Wash cold", "Dry in shade"] },
      { type: "quote", text: "Slow fashion", cite: "Founder" },
      { type: "button", label: "Shop now", href: "/collections/new", style: "primary" },
      { type: "divider" },
    ];
    const r = contentBlocksSchema.safeParse(blocks);
    expect(r.success).toBe(true);
  });

  it("applies defaults and strips unknown keys (e.g. editor ids, html)", () => {
    const r = contentBlocksSchema.parse([{ type: "heading", text: "Hi", id: "x", html: "<b>" }, { type: "button", label: "Go", href: "https://example.com" }]);
    expect(r[0]).toEqual({ type: "heading", level: 2, text: "Hi" });
    expect(r[1]).toEqual({ type: "button", label: "Go", href: "https://example.com", style: "primary" });
  });

  it("rejects unsafe or invalid blocks", () => {
    expect(contentBlocksSchema.safeParse([{ type: "button", label: "x", href: "javascript:alert(1)" }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "image", path: "https://evil.com/x.png", alt: "" }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "image", path: `tenant/${T}/../../x.png`, alt: "" }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "heading", level: 1, text: "H1 is reserved" }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "html", html: "<script>" }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "list", items: [] }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse([{ type: "paragraph", text: "   " }]).success).toBe(false);
    expect(contentBlocksSchema.safeParse(Array.from({ length: 101 }, () => ({ type: "divider" }))).success).toBe(false);
  });

  it("parseStoredBlocks drops invalid entries leniently", () => {
    expect(parseStoredBlocks("nope")).toEqual([]);
    expect(parseStoredBlocks([{ type: "divider" }, { type: "bogus" }, null])).toEqual([{ type: "divider" }]);
  });

  it("blocksBelongToTenant blocks cross-tenant images", () => {
    const own = contentBlocksSchema.parse([{ type: "image", path: `tenant/${T}/pages/a.png`, alt: "" }]);
    const foreign = contentBlocksSchema.parse([{ type: "image", path: `tenant/${OTHER}/pages/a.png`, alt: "" }]);
    expect(blocksBelongToTenant(own, T)).toBe(true);
    expect(blocksBelongToTenant(foreign, T)).toBe(false);
  });

  it("blocksToPlainText builds a trimmed excerpt", () => {
    const b = contentBlocksSchema.parse([
      { type: "heading", text: "Hello" },
      { type: "paragraph", text: "World   again" },
      { type: "list", items: ["a", "b"] },
      { type: "divider" },
    ]);
    expect(blocksToPlainText(b)).toBe("Hello World again a, b");
    expect(blocksToPlainText(b, 8)).toBe("Hello W…");
  });
});
