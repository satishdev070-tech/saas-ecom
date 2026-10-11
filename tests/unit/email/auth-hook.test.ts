import { describe, expect, it, vi } from "vitest";
import { signStandardWebhook, verifyStandardWebhook, webhookKey } from "@/lib/email/standard-webhook";
import { renderAuthEmail, renderStoreCreatedEmail, isAuthEmailAction } from "@/features/notifications/email/account-templates";
import { senderDomain, listResendDomains } from "@/lib/email/resend";

vi.mock("@/features/platform/server/public-config", () => ({ getPublicPlatformConfig: vi.fn(), brandImageView: vi.fn() }));
vi.mock("@/features/notifications/email/channel", () => ({ loadStoreContext: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

const { buildActionLink, otpTypeFor, parseAuthHookPayload } = await import("@/features/notifications/email/auth-hook");

const SECRET = `v1,whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;

describe("standard webhook signatures (Supabase auth hooks)", () => {
  const body = JSON.stringify({ hello: "world" });
  const ts = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature, including one of several", () => {
    const sig = signStandardWebhook(SECRET, "msg_1", ts, body);
    expect(verifyStandardWebhook({ secret: SECRET, id: "msg_1", timestamp: ts, signature: sig, body })).toBe(true);
    expect(verifyStandardWebhook({ secret: SECRET, id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sig}`, body })).toBe(true);
  });

  it("rejects tampering, wrong id, stale timestamps and junk", () => {
    const sig = signStandardWebhook(SECRET, "msg_1", ts, body);
    expect(verifyStandardWebhook({ secret: SECRET, id: "msg_1", timestamp: ts, signature: sig, body: body + " " })).toBe(false);
    expect(verifyStandardWebhook({ secret: SECRET, id: "msg_2", timestamp: ts, signature: sig, body })).toBe(false);
    const old = String(Number(ts) - 3600);
    expect(verifyStandardWebhook({ secret: SECRET, id: "msg_1", timestamp: old, signature: signStandardWebhook(SECRET, "msg_1", old, body), body })).toBe(false);
    expect(verifyStandardWebhook({ secret: SECRET, id: null, timestamp: ts, signature: sig, body })).toBe(false);
    expect(verifyStandardWebhook({ secret: "nope!", id: "msg_1", timestamp: ts, signature: sig, body })).toBe(false);
    expect(webhookKey("v1,whsec_short")).toBeNull();
  });
});

describe("auth email links", () => {
  const trusted = (u: URL) => u.host === "acme.buildbrighten.in";

  it("appends the token hash to a trusted callback", () => {
    const link = buildActionLink({ redirectTo: "https://acme.buildbrighten.in/account/auth/callback?next=/account", tokenHash: "abc", type: "recovery", trusted, fallbackOrigin: "https://buildbrighten.in" });
    const u = new URL(link);
    expect(u.host).toBe("acme.buildbrighten.in");
    expect(u.searchParams.get("next")).toBe("/account");
    expect(u.searchParams.get("token_hash")).toBe("abc");
    expect(u.searchParams.get("type")).toBe("recovery");
  });

  it("never links to a foreign host; falls back to /auth/confirm", () => {
    const link = buildActionLink({ redirectTo: "https://evil.example/steal", tokenHash: "abc", type: "recovery", trusted, fallbackOrigin: "https://buildbrighten.in" });
    const u = new URL(link);
    expect(u.origin).toBe("https://buildbrighten.in");
    expect(u.pathname).toBe("/auth/confirm");
    expect(u.searchParams.get("next")).toBe("/reset-password");
    expect(buildActionLink({ redirectTo: "javascript:alert(1)", tokenHash: "x", type: "signup", trusted: () => true, fallbackOrigin: "https://buildbrighten.in" })).toMatch(/^https:\/\/buildbrighten\.in\/auth\/confirm\?/);
  });

  it("maps actions and parses Supabase payloads", () => {
    expect(otpTypeFor("email_change_new")).toBe("email_change");
    expect(otpTypeFor("signup")).toBe("signup");
    expect(isAuthEmailAction("recovery")).toBe(true);
    expect(isAuthEmailAction("weird")).toBe(false);
    expect(parseAuthHookPayload({ user: { id: "u", email: "a@b.in" }, email_data: { email_action_type: "signup", token_hash: "h", redirect_to: "" } })).not.toBeNull();
    expect(parseAuthHookPayload({ user: {} })).toBeNull();
  });
});

describe("account email templates", () => {
  const brand = { storeName: "Build Brighten", storeUrl: "https://buildbrighten.in" };

  it("renders a reset email with an escaped, https-only button", () => {
    const e = renderAuthEmail({ action: "recovery", brand, actionUrl: "https://buildbrighten.in/auth/confirm?token_hash=x&type=recovery" });
    expect(e.subject).toContain("Reset");
    expect(e.html).toContain("token_hash=x&amp;type=recovery");
    expect(e.text).toContain("https://buildbrighten.in/auth/confirm");
    const bad = renderAuthEmail({ action: "signup", brand: { storeName: "<b>Shop</b>" }, actionUrl: "javascript:alert(1)" });
    expect(bad.html).not.toContain("javascript:");
    expect(bad.html).toContain("&lt;b&gt;Shop&lt;/b&gt;");
  });

  it("shows a one-time code for re-authentication", () => {
    const e = renderAuthEmail({ action: "reauthentication", brand, actionUrl: null, otp: "123456" });
    expect(e.html).toContain("123456");
    expect(e.text).toContain("Your code: 123456");
  });

  it("store-created email differs for new and existing owners", () => {
    const n = renderStoreCreatedEmail({ brand, storeName: "Acme", storeUrl: "https://acme.buildbrighten.in", actionUrl: "https://buildbrighten.in/x", newAccount: true });
    const o = renderStoreCreatedEmail({ brand, storeName: "Acme", storeUrl: "https://acme.buildbrighten.in", actionUrl: "https://buildbrighten.in/x", newAccount: false });
    expect(n.html).toContain("Set your password");
    expect(o.html).toContain("Open your dashboard");
  });
});

describe("Resend helpers", () => {
  it("extracts the sender domain", () => {
    expect(senderDomain("Build Brighten <no-reply@mail.buildbrighten.in>")).toBe("mail.buildbrighten.in");
    expect(senderDomain("orders@shop.in")).toBe("shop.in");
    expect(senderDomain("nope")).toBeNull();
  });

  it("reports restricted keys without throwing", async () => {
    const restricted = vi.fn(async () => new Response(JSON.stringify({ name: "restricted_api_key" }), { status: 401 }));
    expect(await listResendDomains("re_x", restricted as unknown as typeof fetch)).toEqual({ ok: false, reason: "restricted" });
    const ok = vi.fn(async () => new Response(JSON.stringify({ data: [{ name: "mail.x.in", status: "verified", region: "us-east-1" }] }), { status: 200 }));
    expect(await listResendDomains("re_x", ok as unknown as typeof fetch)).toEqual({ ok: true, domains: [{ name: "mail.x.in", status: "verified", region: "us-east-1" }] });
  });
});
