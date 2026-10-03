import "server-only";
import { serverEnv } from "@/lib/env/server";
import { graphError } from "@/features/inbox/server/graph";
import { parseTemplateNode, type ApprovedTemplate, type TemplateMessage } from "./templates";
import type { AttemptOutcome } from "./policy";

/**
 * WhatsApp Cloud API calls for notifications (official docs):
 *   POST /{phone-number-id}/messages (Bearer token), type "template" -> { messages: [{ id }] }
 *   GET  /{waba-id}/message_templates?fields=name,language,status,category,components,parameter_format
 *        -> { data: [...], paging: { cursors, next } }
 * Tokens are sent only in the Authorization header and never logged or returned.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT = 15_000;
const base = () => `https://graph.facebook.com/${serverEnv().META_GRAPH_VERSION}`;

export async function sendTemplateMessage(phoneNumberId: string, token: string, payload: TemplateMessage, fetchImpl: FetchLike = fetch): Promise<AttemptOutcome> {
  let status = 0;
  let body: Record<string, unknown> = {};
  try {
    const res = await fetchImpl(`${base()}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    status = res.status;
    body = ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
  } catch {
    status = 0;
  }
  const id = ((body.messages as { id?: unknown }[] | undefined) ?? [])[0]?.id;
  if (status >= 200 && status < 300 && typeof id === "string") return { ok: true, messageId: id };
  const err = (body.error ?? {}) as { code?: unknown };
  const code = typeof err.code === "number" ? err.code : null;
  return { ok: false, httpStatus: status, code, message: templateError(status, body) };
}

/** graphError() wording plus the template-specific codes. */
function templateError(status: number, body: Record<string, unknown>): string {
  const code = ((body.error ?? {}) as { code?: unknown }).code;
  if (code === 132001) return "The template doesn't exist in this language or isn't approved yet. Check the mapping in Settings → Notifications.";
  if (code === 132000) return "The template's variable count doesn't match. Pick the template again in Settings → Notifications.";
  if (code === 132015 || code === 132016) return "The template is paused or disabled by WhatsApp because of low quality.";
  if (code === 131026) return "This number can't receive WhatsApp messages.";
  if (code === 131050) return "The customer has stopped marketing messages from this business.";
  if (code === 131049) return "WhatsApp didn't deliver this marketing message to protect engagement. It isn't retried.";
  return graphError("WhatsApp", status, body);
}

export type TemplateList = { ok: true; templates: ApprovedTemplate[] } | { ok: false; message: string };

/** All APPROVED templates on the WABA (follows paging.next, max 5 pages of 100). */
export async function listApprovedTemplates(wabaId: string, token: string, fetchImpl: FetchLike = fetch): Promise<TemplateList> {
  if (!wabaId) return { ok: false, message: "The WhatsApp Business Account id is missing. Reconnect WhatsApp in the inbox settings." };
  let url: string | null = `${base()}/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components,parameter_format&limit=100`;
  const out: ApprovedTemplate[] = [];
  for (let page = 0; url && page < 5; page++) {
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const res = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
      status = res.status;
      body = ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
    } catch {
      status = 0;
    }
    if (status !== 200) return { ok: false, message: graphError("WhatsApp", status, body) };
    for (const node of Array.isArray(body.data) ? body.data : []) {
      const t = parseTemplateNode(node);
      if (t && t.status === "APPROVED") out.push(t);
    }
    const next = ((body.paging ?? {}) as { next?: unknown }).next;
    url = typeof next === "string" && next.startsWith("https://graph.facebook.com/") ? next : null;
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
  return { ok: true, templates: out };
}
