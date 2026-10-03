import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMetaPayload, parseWhatsAppPayload, verifyMetaSignature, verifySubscription } from "@/features/inbox/webhook";
import { WINDOW_MS, serviceWindow, windowClosedMessage, windowLabel } from "@/features/inbox/window";

const SECRET = "app-secret-123";
const sign = (body: string | Buffer, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("X-Hub-Signature-256 verification", () => {
  const body = JSON.stringify({ object: "page", entry: [{ id: "1", messaging: [] }], note: "नमस्ते ✓" });

  it("accepts the HMAC of the exact raw bytes", () => {
    expect(verifyMetaSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
    expect(verifyMetaSignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and malformed headers", () => {
    expect(verifyMetaSignature(Buffer.from(body + " "), sign(body), SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), sign(body, "other"), SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), sign(body).replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), "sha256=abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), null, SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), sign(body), "")).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), sign(body), null)).toBe(false);
  });
});

describe("hub.challenge verification", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);
  it("echoes the challenge only for a matching token", () => {
    expect(verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1158201444" }), "tok")).toBe("1158201444");
    expect(verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }), "tok")).toBeNull();
    expect(verifySubscription(params({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), "tok")).toBeNull();
    expect(verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1" }), undefined)).toBeNull();
    expect(verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1" }), "")).toBeNull();
  });
});

describe("Messenger / Instagram payload parsing", () => {
  it("parses inbound text, attachments, echoes and postbacks; skips other events", () => {
    const ts = Date.now() - 60_000;
    const events = parseMetaPayload({
      object: "page",
      entry: [
        {
          id: "PAGE1",
          time: ts,
          messaging: [
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, message: { mid: "m_1", text: "Is this in stock?" } },
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, message: { mid: "m_2", attachments: [{ type: "image", payload: { url: "https://cdn.example/x.jpg" } }] } },
            { sender: { id: "PAGE1" }, recipient: { id: "PSID1" }, timestamp: ts, message: { mid: "m_3", text: "Yes!", is_echo: true } },
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, postback: { mid: "m_4", title: "Get started", payload: "START" } },
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, delivery: { mids: ["m_3"] } },
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, read: { watermark: ts } },
            { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: ts, message: { text: "no mid" } },
          ],
        },
      ],
    });
    expect(events.map((e) => [e.externalId, e.direction, e.participantId, e.text])).toEqual([
      ["m_1", "in", "PSID1", "Is this in stock?"],
      ["m_2", "in", "PSID1", "[image]"],
      ["m_3", "out", "PSID1", "Yes!"],
      ["m_4", "in", "PSID1", "Get started"],
    ]);
    expect(events[0]).toMatchObject({ channel: "facebook", accountId: "PAGE1", at: new Date(ts).toISOString() });
    expect(events[1]!.mediaUrl).toBe("https://cdn.example/x.jpg");
  });

  it("maps object=instagram to the instagram channel and drops unsends", () => {
    const events = parseMetaPayload({
      object: "instagram",
      entry: [{ id: "IG1", messaging: [
        { sender: { id: "IGSID" }, recipient: { id: "IG1" }, timestamp: 1, message: { mid: "ig_1", text: "hi" } },
        { sender: { id: "IGSID" }, recipient: { id: "IG1" }, timestamp: 1, message: { mid: "ig_2", is_deleted: true } },
      ] }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ channel: "instagram", accountId: "IG1", participantId: "IGSID" });
  });

  it("ignores unknown objects, junk and http attachment urls", () => {
    expect(parseMetaPayload({ object: "user", entry: [] })).toEqual([]);
    expect(parseMetaPayload(null)).toEqual([]);
    expect(parseMetaPayload({ object: "page", entry: "x" })).toEqual([]);
    const e = parseMetaPayload({ object: "page", entry: [{ id: "P", messaging: [{ sender: { id: "S" }, recipient: { id: "P" }, message: { mid: "x", text: "a", attachments: [{ type: "file", payload: { url: "http://insecure" } }] } }] }] });
    expect(e[0]!.mediaUrl).toBeNull();
  });

  it("clips long bodies and never dates a message in the future", () => {
    const e = parseMetaPayload({ object: "page", entry: [{ id: "P", messaging: [{ sender: { id: "S" }, recipient: { id: "P" }, timestamp: Date.now() + 86400_000, message: { mid: "x", text: "a".repeat(5000) } }] }] });
    expect(e[0]!.text.length).toBe(4096);
    expect(Date.parse(e[0]!.at)).toBeLessThanOrEqual(Date.now());
  });
});

describe("WhatsApp Cloud API payload parsing", () => {
  const wrap = (value: unknown, field = "messages") => ({ object: "whatsapp_business_account", entry: [{ id: "WABA1", changes: [{ field, value }] }] });

  it("parses messages with contact names and message types", () => {
    const events = parseWhatsAppPayload(
      wrap({
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550001111", phone_number_id: "PNID1" },
        contacts: [{ wa_id: "919800000001", profile: { name: "Asha" } }],
        messages: [
          { from: "919800000001", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Hello" } },
          { from: "919800000001", id: "wamid.2", timestamp: "1700000001", type: "image", image: { id: "media1", caption: "this one" } },
          { from: "919800000001", id: "wamid.3", timestamp: "1700000002", type: "audio", audio: { id: "media2" } },
          { from: "919800000001", id: "wamid.4", timestamp: "1700000003", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b", title: "Yes" } } },
        ],
      }),
    );
    expect(events.map((e) => (e.type === "message" ? e.text : e.status))).toEqual(["Hello", "this one", "[audio]", "Yes"]);
    expect(events[0]).toMatchObject({ type: "message", channel: "whatsapp", accountId: "PNID1", participantId: "919800000001", participantName: "Asha", externalId: "wamid.1", at: new Date(1700000000_000).toISOString() });
  });

  it("parses delivery statuses, including failures", () => {
    const events = parseWhatsAppPayload(
      wrap({
        metadata: { phone_number_id: "PNID1" },
        statuses: [
          { id: "wamid.out1", status: "delivered", timestamp: "1", recipient_id: "91" },
          { id: "wamid.out2", status: "failed", timestamp: "1", recipient_id: "91", errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "Message failed to send because more than 24 hours have passed" } }] },
          { id: "wamid.out3", status: "unknown_future_status" },
        ],
      }),
    );
    expect(events).toEqual([
      { type: "status", channel: "whatsapp", accountId: "PNID1", externalId: "wamid.out1", status: "sent", error: null },
      { type: "status", channel: "whatsapp", accountId: "PNID1", externalId: "wamid.out2", status: "failed", error: "Message failed to send because more than 24 hours have passed (code 131047)" },
    ]);
  });

  it("ignores other objects, other fields and values without a phone_number_id", () => {
    expect(parseWhatsAppPayload({ object: "page", entry: [] })).toEqual([]);
    expect(parseWhatsAppPayload(wrap({ metadata: { phone_number_id: "P" }, messages: [{ from: "1", id: "x", type: "text", text: { body: "a" } }] }, "account_update"))).toEqual([]);
    expect(parseWhatsAppPayload(wrap({ messages: [{ from: "1", id: "x", type: "text", text: { body: "a" } }] }))).toEqual([]);
  });
});

describe("24-hour customer-service window", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("is open within 24h of the customer's last message and closed after", () => {
    expect(serviceWindow(new Date(now - 60_000).toISOString(), now)).toMatchObject({ open: true });
    expect(serviceWindow(new Date(now - WINDOW_MS + 1000).toISOString(), now).open).toBe(true);
    expect(serviceWindow(new Date(now - WINDOW_MS).toISOString(), now).open).toBe(false);
    expect(serviceWindow(new Date(now - 2 * WINDOW_MS).toISOString(), now)).toMatchObject({ open: false, remainingMs: 0 });
  });
  it("is closed when the customer never wrote", () => {
    expect(serviceWindow(null, now)).toEqual({ open: false, closesAt: null, remainingMs: 0 });
    expect(serviceWindow("garbage", now).open).toBe(false);
  });
  it("labels the remaining time and explains the template requirement", () => {
    expect(windowLabel(serviceWindow(new Date(now - (WINDOW_MS - 5 * 3600_000 - 12 * 60_000)).toISOString(), now))).toBe("5h 12m left");
    expect(windowLabel(serviceWindow(new Date(now - (WINDOW_MS - 40 * 60_000)).toISOString(), now))).toBe("40m left");
    expect(windowLabel(serviceWindow(null, now))).toBe("Closed");
    expect(windowClosedMessage("whatsapp")).toMatch(/template/);
    expect(windowClosedMessage("facebook")).toMatch(/message tag/);
  });
});
