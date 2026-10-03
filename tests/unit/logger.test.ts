import { describe, expect, it } from "vitest";
import { redact } from "@/lib/observability/logger";

describe("redact", () => {
  it("masks secrets and PII keys at any depth", () => {
    const out = redact({ user: { id: "u1", email: "a@b.c", phone: "+91", nested: { accessToken: "t" } }, password: "p" }) as Record<string, unknown>;
    expect(out).toEqual({ user: { id: "u1", email: "[redacted]", phone: "[redacted]", nested: { accessToken: "[redacted]" } }, password: "[redacted]" });
  });
});
