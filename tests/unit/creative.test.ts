import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { color, renderCreativeSvg, validateValues, wrapText, type Brand } from "@/features/creative/engine";
import { BUILTIN_TEMPLATES } from "@/features/creative/templates";

const brand: Brand = { name: "Aangan & Co", colors: { primary: "#1f1a17", secondary: "#7a2e1f", accent: "#b4532a", background: "#fbf8f3", text: "#1f1a17", sale: "#b3261e" }, headingSerif: true, bodySerif: false, logoHref: null };

describe("creative engine", () => {
  it("covers all nine categories with unique keys", () => {
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.category)).size).toBe(9);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.key)).size).toBe(BUILTIN_TEMPLATES.length);
  });

  it("escapes seller text and rejects bad colours", () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.key === "announcement-minimal")!;
    const svg = renderCreativeSvg(t, brand, { headline: '</text><script>alert(1)</script>"' }, null);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;/text&gt;&lt;script&gt;");
    expect(svg).toContain("Aangan &amp; Co");
    expect(color("#zzzzzz" as `#${string}`, brand)).toBe("#000000");
    expect(color("accent", brand)).toBe("#b4532a");
  });

  it("wraps and truncates long text", () => {
    const lines = wrapText("Hand block printed cotton kurta sets for everyday summer comfort", 360, 40, 2, false);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  it("validates field lengths and required fields", () => {
    const t = BUILTIN_TEMPLATES[0]!;
    expect(validateValues(t, { headline: "" }).errors.headline).toBeDefined();
    expect(validateValues(t, { headline: "x".repeat(100) }).errors.headline?.[0]).toMatch(/At most/);
    expect(validateValues(t, { headline: "Just landed", price: "₹999" }).values).toEqual({ headline: "Just landed", price: "₹999" });
  });

  it("renders every template to a PNG of the right size", async () => {
    const pixel = `data:image/png;base64,${(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#cc8844" } }).png().toBuffer()).toString("base64")}`;
    for (const t of BUILTIN_TEMPLATES) {
      const svg = renderCreativeSvg(t, brand, { headline: "Festive edit", subheadline: "Silk and zari", price: "₹2,490", discount: "20% off", cta: "Shop", date: "Sunday" }, pixel);
      const meta = await sharp(await sharp(Buffer.from(svg)).png().toBuffer()).metadata();
      expect([meta.width, meta.height]).toEqual([t.width, t.height]);
    }
  }, 30_000);
});
