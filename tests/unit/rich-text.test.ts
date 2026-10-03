import { describe, expect, it } from "vitest";
import { parseRichText } from "@/features/storefront/components/rich-text";

describe("product copy formatter", () => {
  it("joins lone bullets to their text, groups lists, and keeps paragraphs", () => {
    const text = "Embrace the charm of handcrafted fashion.\n\nKey Highlights\n\n•\n\nNeckline: Oblong square neckline\n\n•\n\nSleeves: Sleeveless\n\nOrigin: Proudly Made in India\n\nCare Instructions\n\n• Gentle machine wash\n• Do not bleach";
    expect(parseRichText(text)).toEqual([
      { kind: "p", text: "Embrace the charm of handcrafted fashion." },
      { kind: "h", text: "Key Highlights" },
      { kind: "ul", items: ["Neckline: Oblong square neckline", "Sleeves: Sleeveless"] },
      { kind: "p", text: "Origin: Proudly Made in India" },
      { kind: "h", text: "Care Instructions" },
      { kind: "ul", items: ["Gentle machine wash", "Do not bleach"] },
    ]);
  });
  it("treats plain sentences as paragraphs, not headings", () => {
    expect(parseRichText("Soft cotton.\nMade in Jaipur.")).toEqual([{ kind: "p", text: "Soft cotton. Made in Jaipur." }]);
  });
});
