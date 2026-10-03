import { describe, expect, it, vi } from "vitest";
import { buildResendRequest, postToResend, RESEND_ENDPOINT } from "@/lib/email/resend";
import { formatFrom, hashRecipient, maskEmail, normaliseIdempotencyKey, parseMailbox } from "@/lib/email/address";

const msg = { from: "Ramya <orders@mail.example.com>", to: "a@b.in", subject: "Hi", html: "<p>Hi</p>", text: "Hi", replyTo: "store@x.in", idempotencyKey: "t:order:1:placed:email", kind: "order_placed" };

describe("Resend client", () => {
  it("builds the documented request", () => {
    const { url, init } = buildResendRequest(msg, "re_test_key_123");
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer re_test_key_123");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["Idempotency-Key"]).toBe("t:order:1:placed:email");
    expect(JSON.parse(init.body as string)).toEqual({ from: msg.from, to: ["a@b.in"], subject: "Hi", html: "<p>Hi</p>", text: "Hi", reply_to: "store@x.in", tags: [{ name: "kind", value: "order_placed" }] });
  });

  it("returns the provider id on success", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    expect(await postToResend(msg, "re_k_12345678", f as unknown as typeof fetch)).toEqual({ ok: true, id: "em_1" });
    expect(f).toHaveBeenCalledOnce();
  });

  it("reports errors without leaking the key or body, and never claims success", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "Invalid from" }), { status: 422 }));
    const r = await postToResend(msg, "re_secret_12345678", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "resend 422: Invalid from", retryable: false });
    expect(JSON.stringify(r)).not.toContain("re_secret");
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await postToResend(msg, "re_k_12345678", down as unknown as typeof fetch)).toEqual({ ok: false, error: "resend network error", retryable: true });
    const limited = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await postToResend(msg, "re_k_12345678", limited as unknown as typeof fetch)).toMatchObject({ ok: false, retryable: true });
  });
});

describe("address helpers", () => {
  it("keeps the verified address and swaps only the display name", () => {
    expect(formatFrom("The Paliya <no-reply@mail.example.com>", "Ramya By Ayushi")).toBe("Ramya By Ayushi <no-reply@mail.example.com>");
    expect(formatFrom("no-reply@mail.example.com", 'Evil" <x@y.z>\r\nBcc: a@b')).toBe("Evil x y.z Bcc a b <no-reply@mail.example.com>");
    expect(formatFrom("The Paliya <no-reply@mail.example.com>", null)).toBe("The Paliya <no-reply@mail.example.com>");
    expect(parseMailbox("nonsense")).toBeNull();
  });

  it("masks and hashes recipients; long idempotency keys are hashed to <= 256 chars", () => {
    expect(maskEmail("Ramya@Gmail.com")).toBe("r***@gmail.com");
    expect(hashRecipient(" A@B.in ")).toBe(hashRecipient("a@b.in"));
    expect(normaliseIdempotencyKey("x".repeat(300)).length).toBeLessThanOrEqual(256);
    expect(normaliseIdempotencyKey("short")).toBe("short");
  });
});
