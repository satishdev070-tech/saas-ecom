import { describe, expect, it } from "vitest";
import { composeText, normalizeHashtags, overallStatus } from "@/features/social/compose";

describe("social post helpers", () => {
  it("normalises hashtags", () => {
    expect(normalizeHashtags("handloom, #Kurta  ##festive #kurta bad-tag! हस्तकला")).toEqual(["#handloom", "#Kurta", "#festive", "#badtag", "#हस्तकला"]);
    expect(normalizeHashtags(Array.from({ length: 40 }, (_, i) => `t${i}`))).toHaveLength(30);
  });

  it("composes per-platform text", () => {
    const p = { caption: "New drop", hashtags: ["#kurta"], link: "https://x.in/p" };
    expect(composeText(p, "facebook")).toBe("New drop\n\nhttps://x.in/p\n\n#kurta");
    expect(composeText(p, "instagram")).toBe("New drop\n\n#kurta");
    expect(composeText(p, "pinterest")).toBe("New drop");
  });

  it("marks a post published when at least one network succeeded", () => {
    const at = "2026-09-26T00:00:00Z";
    expect(overallStatus(["facebook", "instagram"], { facebook: { ok: true, at }, instagram: { ok: false, error: "x", at } })).toBe("published");
    expect(overallStatus(["facebook"], { facebook: { ok: false, error: "x", at } })).toBe("failed");
    expect(overallStatus(["pinterest"], {})).toBe("failed");
  });
});
