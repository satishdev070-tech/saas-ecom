import { normaliseIdempotencyKey } from "./address";

/**
 * Resend REST client (https://resend.com/docs/api-reference/emails/send-email):
 * POST https://api.resend.com/emails, `Authorization: Bearer <RESEND_API_KEY>`, JSON body
 * { from, to, subject, html, text, reply_to, tags }, optional `Idempotency-Key` header
 * (unique per request, <= 256 chars, honoured for 24 h). Success returns `{ id }`.
 * PURE apart from the injected fetch, so the request shape is unit tested.
 */

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey: string;
  /** Resend tag (ASCII letters, digits, `_`, `-`); used to filter in the Resend dashboard. */
  kind?: string;
};

export type ProviderResult = { ok: true; id: string | null } | { ok: false; error: string; retryable: boolean };

const TAG_RE = /[^A-Za-z0-9_-]/g;

export function buildResendRequest(msg: OutgoingEmail, apiKey: string): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    from: msg.from,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) body.reply_to = msg.replyTo;
  if (msg.kind) body.tags = [{ name: "kind", value: msg.kind.replace(TAG_RE, "_").slice(0, 256) }];
  return {
    url: RESEND_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": normaliseIdempotencyKey(msg.idempotencyKey),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  };
}

/** Sends one email. Never throws; never includes the API key or the body in the error text. */
export async function postToResend(msg: OutgoingEmail, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ProviderResult> {
  const { url, init } = buildResendRequest(msg, apiKey);
  try {
    const res = await fetchImpl(url, init);
    const json = (await res.json().catch(() => ({}))) as { id?: unknown; message?: unknown; name?: unknown };
    if (!res.ok) {
      const detail = typeof json.message === "string" ? json.message : typeof json.name === "string" ? json.name : "";
      return { ok: false, error: `resend ${res.status}${detail ? `: ${detail}` : ""}`.slice(0, 300), retryable: res.status === 429 || res.status >= 500 };
    }
    return { ok: true, id: typeof json.id === "string" ? json.id.slice(0, 120) : null };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "resend timeout" : "resend network error", retryable: true };
  }
}
