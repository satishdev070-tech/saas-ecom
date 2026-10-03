import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure webhook helpers for the unified inbox (no I/O; unit tested).
 *
 * Payload shapes follow Meta's official docs:
 *   Messenger  — object "page", entry[].id = Page id, entry[].messaging[] = { sender.id (PSID),
 *                recipient.id, timestamp (ms), message { mid, text, attachments[], is_echo } | postback }
 *   Instagram  — object "instagram", entry[].id = Instagram professional account id, same messaging[]
 *                shape (sender.id = IGSID); message.is_deleted for unsends.
 *   WhatsApp   — object "whatsapp_business_account", entry[].changes[] { field: "messages",
 *                value { metadata.phone_number_id, contacts[] { wa_id, profile.name },
 *                messages[] { from, id, timestamp (s), type, text.body | image.caption | ... },
 *                statuses[] { id, status: sent|delivered|read|failed, errors[] } } }
 * Signatures: X-Hub-Signature-256 = "sha256=" + hex HMAC-SHA256(raw body, app secret).
 */

export type InboxChannel = "facebook" | "instagram" | "whatsapp";

export type InboundMessage = {
  type: "message";
  channel: InboxChannel;
  /** Page id, Instagram account id or WhatsApp phone_number_id: the key for the tenant lookup. */
  accountId: string;
  /** "out" = an echo of a message the business sent (e.g. from Meta Business Suite or our own reply). */
  direction: "in" | "out";
  participantId: string;
  participantName: string | null;
  externalId: string;
  text: string;
  mediaUrl: string | null;
  at: string;
};

export type DeliveryStatus = {
  type: "status";
  channel: "whatsapp";
  accountId: string;
  externalId: string;
  status: "sent" | "failed";
  error: string | null;
};

export type InboxEvent = InboundMessage | DeliveryStatus;

export const MAX_BODY = 4096;
const MAX_ID = 200;

/** Timing-safe check of Meta's X-Hub-Signature-256 header against the raw request bytes. */
export function verifyMetaSignature(rawBody: Uint8Array | string, header: string | null | undefined, appSecret: string | null | undefined): boolean {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const hex = header.slice(7).trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(hex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET subscription handshake: returns the challenge to echo, or null (respond 403). */
export function verifySubscription(params: URLSearchParams, expectedToken: string | null | undefined): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge || !expectedToken) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return challenge.length <= 200 ? challenge : null;
}

// ------------------------------------------------------------------ helpers

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null);
const id = (v: unknown): string | null => {
  const s = str(v);
  return s && s.length <= MAX_ID ? s : null;
};

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function isoFrom(value: unknown, unit: "ms" | "s"): string {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  const d = new Date(unit === "s" ? n * 1000 : n);
  // Clamp clock skew: never store a time in the future.
  return d.getTime() > Date.now() ? new Date().toISOString() : d.toISOString();
}

const httpsUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && s.startsWith("https://") && s.length <= 1000 ? s : null;
};

// ------------------------------------------------------------------ Messenger + Instagram

/** Parses a verified Messenger ("page") or Instagram ("instagram") webhook body. Unknown events are skipped. */
export function parseMetaPayload(body: unknown): InboundMessage[] {
  const root = obj(body);
  if (!root) return [];
  const channel: InboxChannel | null = root.object === "page" ? "facebook" : root.object === "instagram" ? "instagram" : null;
  if (!channel) return [];
  const out: InboundMessage[] = [];
  for (const e of arr(root.entry)) {
    const entry = obj(e);
    const accountId = id(entry?.id);
    if (!entry || !accountId) continue;
    for (const m of arr(entry.messaging)) {
      const ev = obj(m);
      if (!ev) continue;
      const sender = id(obj(ev.sender)?.id);
      const recipient = id(obj(ev.recipient)?.id);
      if (!sender || !recipient) continue;
      const at = isoFrom(ev.timestamp, "ms");
      const message = obj(ev.message);
      const postback = obj(ev.postback);
      if (message) {
        if (message.is_deleted === true || message.is_unsupported === true) continue;
        const mid = id(message.mid);
        if (!mid) continue;
        const echo = message.is_echo === true;
        const attachments = arr(message.attachments).map(obj).filter((a): a is Obj => a !== null);
        const firstUrl = attachments.map((a) => httpsUrl(obj(a.payload)?.url)).find(Boolean) ?? null;
        const text = str(message.text) ?? (attachments.length ? attachments.map((a) => `[${str(a.type) ?? "attachment"}]`).join(" ") : "");
        if (!text && !firstUrl) continue;
        out.push({ type: "message", channel, accountId, direction: echo ? "out" : "in", participantId: echo ? recipient : sender, participantName: null, externalId: mid, text: clip(text, MAX_BODY), mediaUrl: firstUrl, at });
      } else if (postback) {
        const mid = id(postback.mid);
        const title = str(postback.title) ?? str(postback.payload);
        if (!mid || !title) continue;
        out.push({ type: "message", channel, accountId, direction: "in", participantId: sender, participantName: null, externalId: mid, text: clip(title, MAX_BODY), mediaUrl: null, at });
      }
      // delivery / read / reaction / referral events are not stored.
    }
  }
  return out;
}

// ------------------------------------------------------------------ WhatsApp Cloud API

function whatsappText(msg: Obj): string {
  const type = str(msg.type) ?? "unknown";
  const part = obj(msg[type]);
  switch (type) {
    case "text":
      return str(part?.body) ?? "";
    case "image":
    case "video":
    case "document":
      return str(part?.caption) ?? `[${type}${type === "document" && str(part?.filename) ? `: ${str(part?.filename)}` : ""}]`;
    case "button":
      return str(part?.text) ?? "[button]";
    case "interactive": {
      const reply = obj(part?.button_reply) ?? obj(part?.list_reply);
      return str(reply?.title) ?? "[interactive reply]";
    }
    case "reaction":
      return str(part?.emoji) ? `Reacted ${str(part?.emoji)}` : "[reaction removed]";
    case "location": {
      const name = str(part?.name) ?? str(part?.address);
      return name ? `[location: ${name}]` : "[location]";
    }
    default:
      return `[${type}]`;
  }
}

/** Parses a verified WhatsApp Cloud API webhook body: inbound messages and delivery statuses. */
export function parseWhatsAppPayload(body: unknown): InboxEvent[] {
  const root = obj(body);
  if (!root || root.object !== "whatsapp_business_account") return [];
  const out: InboxEvent[] = [];
  for (const e of arr(root.entry)) {
    for (const c of arr(obj(e)?.changes)) {
      const change = obj(c);
      if (!change || change.field !== "messages") continue;
      const value = obj(change.value);
      const accountId = id(obj(value?.metadata)?.phone_number_id);
      if (!value || !accountId) continue;
      const names = new Map<string, string>();
      for (const ct of arr(value.contacts)) {
        const contact = obj(ct);
        const wa = id(contact?.wa_id);
        const name = str(obj(contact?.profile)?.name);
        if (wa && name) names.set(wa, clip(name, 200));
      }
      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const from = id(msg?.from);
        const mid = id(msg?.id);
        if (!msg || !from || !mid) continue;
        const text = whatsappText(msg);
        out.push({ type: "message", channel: "whatsapp", accountId, direction: "in", participantId: from, participantName: names.get(from) ?? null, externalId: mid, text: clip(text, MAX_BODY), mediaUrl: null, at: isoFrom(msg.timestamp, "s") });
      }
      for (const s of arr(value.statuses)) {
        const st = obj(s);
        const mid = id(st?.id);
        const status = str(st?.status);
        if (!st || !mid || !status) continue;
        if (status === "failed") {
          const err = obj(arr(st.errors)[0]);
          const detail = str(obj(err?.error_data)?.details) ?? str(err?.message) ?? str(err?.title);
          const code = str(err?.code);
          out.push({ type: "status", channel: "whatsapp", accountId, externalId: mid, status: "failed", error: clip(`${detail ?? "WhatsApp couldn't deliver this message"}${code ? ` (code ${code})` : ""}`, 500) });
        } else if (status === "sent" || status === "delivered" || status === "read") {
          out.push({ type: "status", channel: "whatsapp", accountId, externalId: mid, status: "sent", error: null });
        }
      }
    }
  }
  return out;
}
