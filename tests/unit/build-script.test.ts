import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS build helper without type declarations
import { chooseBundler, glibcTooOld } from "../../scripts/build.mjs";

describe("build bundler choice (scripts/build.mjs)", () => {
  it("uses webpack where Next's native compiler can't run (old glibc, e.g. Hostinger)", () => {
    expect(glibcTooOld("2.28")).toBe(true);
    expect(glibcTooOld("2.17")).toBe(true);
    expect(glibcTooOld("2.29")).toBe(false);
    expect(glibcTooOld(undefined)).toBe(false);
    expect(chooseBundler({}, "linux", "2.28", () => true).bundler).toBe("webpack");
    expect(chooseBundler({}, "linux", "2.39", () => false).bundler).toBe("webpack");
  });
  it("keeps Turbopack elsewhere (Vercel) and honours NEXT_BUNDLER", () => {
    expect(chooseBundler({}, "linux", "2.39", () => true).bundler).toBe("turbopack");
    expect(chooseBundler({}, "darwin", undefined, () => true).bundler).toBe("turbopack");
    expect(chooseBundler({ NEXT_BUNDLER: "webpack" }, "linux", "2.39", () => true).bundler).toBe("webpack");
    expect(chooseBundler({ NEXT_BUNDLER: "turbopack" }, "linux", "2.17", () => false).bundler).toBe("turbopack");
  });
});
