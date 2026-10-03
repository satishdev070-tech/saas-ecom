import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/http/safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/orders?status=open#top", "/dashboard/orders?status=open#top"],
  ])("allows same-origin path %s", (input, expected) => expect(safeRedirectPath(input)).toBe(expected));

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/\tevil.com",
    "/%0a/evil.com".replace("%0a", "\n"),
    "dashboard",
    "",
    null,
    undefined,
  ])("falls back for %s", (input) => expect(safeRedirectPath(input as string | null | undefined, "/home")).toBe("/home"));
});
