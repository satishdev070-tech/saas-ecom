import { describe, expect, it } from "vitest";
import { cleanFilename, formatBytes, validateMediaFile } from "@/features/media/rules";

describe("media rules", () => {
  const ok = { name: "kurta.jpg", size: 200_000, type: "image/jpeg", width: 1200, height: 1500 };
  it("accepts a normal product photo", () => expect(validateMediaFile(ok)).toBeNull());
  it("rejects unsupported and mismatched types", () => {
    expect(validateMediaFile({ ...ok, type: "image/svg+xml", name: "x.svg" })).toMatch(/Unsupported/);
    expect(validateMediaFile({ ...ok, type: "application/pdf", name: "x.pdf" })).toMatch(/Unsupported/);
    expect(validateMediaFile({ ...ok, name: "kurta.png" })).toMatch(/doesn't match/);
  });
  it("enforces size and dimension limits", () => {
    expect(validateMediaFile({ ...ok, size: 11 * 1024 * 1024 })).toMatch(/Too large/);
    expect(validateMediaFile({ ...ok, size: 0 })).toMatch(/empty/);
    expect(validateMediaFile({ ...ok, width: 80, height: 80 })).toMatch(/Too small/);
    expect(validateMediaFile({ ...ok, width: 9000 })).toMatch(/maximum/);
  });
  it("formats sizes and cleans names", () => {
    expect(formatBytes(2_516_582)).toBe("2.4 MB");
    expect(cleanFilename("C:\\Users\\a\\photo.jpg")).toBe("photo.jpg");
    expect(cleanFilename("../../x\u0000.png")).toBe("x.png");
  });
});
