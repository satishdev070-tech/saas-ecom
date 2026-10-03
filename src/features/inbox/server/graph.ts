import "server-only";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/observability/logger";

/**
 * Graph API calls for the inbox, per Meta's official docs:
 *   Messenger + Instagram (Facebook Login): POST /{page-id}/messages with the Page token,
 *     { recipient: { id }, messaging_type: "RESPONSE", message: { text } } → { recipient_id, message_id }
 *   Page webhook subscription: POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes
 *   WhatsApp Cloud API: POST /{phone-number-id}/messages (Bearer token),
 *     { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } } → { messages: [{ id }] }
 *   WhatsApp number check: GET /{phone-number-id}?fields=verified_name,display_phone_number
 *   WABA webhook subscription: POST /{waba-id}/subscribed_apps
 * Tokens never appear in logs or in returned messages.
 */
export type GraphResult<T> = { ok: true; data: T } | { ok: false; message: string };

const TIMEOUT = 15_000;
const graph = () => `https://graph.facebook.com/${serverEnv().META_GRAPH_VERSION}`;

async function call(path: string, init: { method: "GET" | "POST"; token: string; bearer?: boolean; json?: unknown }): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(`${graph()}${path}`);
  const headers: Record<string, string> = {};
  if (init.bearer) headers.Authorization = `Bearer ${init.token}`;
  else url.searchParams.set("access_token", init.token);
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(url, { method: init.method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json), signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
    return { status: res.status, body: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
  } catch (err) {
    logger.warn("inbox.graph_network_error", { path: path.split("?")[0]?.replace(/\d{5,}/g, ":id"), error: err });
    return { status: 0, body: {} };
  }
}

/** Our own wording for Graph errors (codes from Meta's error reference). */
export function graphError(channel: string, status: number, body: Record<string, unknown>): string {
  const err = (body.error ?? {}) as { code?: number; error_subcode?: number; message?: string };
  logger.warn("inbox.graph_error", { channel, status, code: err.code, subcode: err.error_subcode });
  if (status === 0) return `Couldn't reach ${channel}. Try again.`;
  if (status === 401 || err.code === 190) return "The connection has expired or was revoked. Reconnect the account.";
  if (err.code === 10 || err.code === 200 || err.code === 3) return `${channel} denied permission. The app may still need Meta App Review for messaging, or the account must grant the messaging permission when connecting.`;
  if (err.code === 4 || err.code === 32 || err.code === 613 || err.code === 130429 || err.code === 80007) return `${channel} rate limit reached. Try again in a few minutes.`;
  if (err.code === 131047 || err.error_subcode === 2018278) return "The 24-hour reply window has closed for this customer.";
  if (err.code === 100) return `${channel} rejected the request (invalid id or parameter).`;
  return `${channel} didn't accept the message${err.code ? ` (error ${err.code})` : ""}.`;
}

export async function sendPageMessage(pageId: string, pageToken: string, recipientId: string, text: string, channel: "Messenger" | "Instagram"): Promise<GraphResult<{ id: string }>> {
  const r = await call(`/${encodeURIComponent(pageId)}/messages`, { method: "POST", token: pageToken, json: { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } } });
  const mid = r.body.message_id;
  return r.status >= 200 && r.status < 300 && typeof mid === "string" ? { ok: true, data: { id: mid } } : { ok: false, message: graphError(channel, r.status, r.body) };
}

export async function subscribePage(pageId: string, pageToken: string): Promise<GraphResult<null>> {
  const r = await call(`/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes`, { method: "POST", token: pageToken });
  return r.status === 200 && r.body.success === true ? { ok: true, data: null } : { ok: false, message: graphError("Facebook", r.status, r.body) };
}

export async function sendWhatsAppText(phoneNumberId: string, token: string, to: string, text: string): Promise<GraphResult<{ id: string }>> {
  const r = await call(`/${encodeURIComponent(phoneNumberId)}/messages`, { method: "POST", token, bearer: true, json: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } } });
  const id = ((r.body.messages as { id?: unknown }[] | undefined) ?? [])[0]?.id;
  return r.status >= 200 && r.status < 300 && typeof id === "string" ? { ok: true, data: { id } } : { ok: false, message: graphError("WhatsApp", r.status, r.body) };
}

export async function whatsappNumber(phoneNumberId: string, token: string): Promise<GraphResult<{ name: string; phone: string }>> {
  const r = await call(`/${encodeURIComponent(phoneNumberId)}?fields=verified_name,display_phone_number`, { method: "GET", token, bearer: true });
  return r.status === 200 && typeof r.body.id === "string"
    ? { ok: true, data: { name: String(r.body.verified_name ?? ""), phone: String(r.body.display_phone_number ?? "") } }
    : { ok: false, message: graphError("WhatsApp", r.status, r.body) };
}

export async function subscribeWaba(wabaId: string, token: string): Promise<GraphResult<null>> {
  const r = await call(`/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", token, bearer: true });
  return r.status === 200 && r.body.success === true ? { ok: true, data: null } : { ok: false, message: graphError("WhatsApp", r.status, r.body) };
}
