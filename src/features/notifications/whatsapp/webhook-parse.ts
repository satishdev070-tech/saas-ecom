/**
 * Pure parser for the parts of a verified WhatsApp webhook that notifications care about
 * (WhatsApp Cloud API docs, webhooks/reference/messages/status):
 *   entry[].changes[] { field: "messages", value { metadata.phone_number_id,
 *     statuses[] { id, status: sent|delivered|read|failed, timestamp (s), errors[] { code, title, message, error_data.details } },
 *     messages[] { from, type: "text", text.body } } }
 */
export type StatusUpdate = { accountId: string; messageId: string; status: "sent" | "delivered" | "read" | "failed"; at: string; error: string | null };
export type KeywordUpdate = { accountId: string; from: string; optIn: boolean };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

const STOP = new Set(["stop", "unsubscribe", "stop all", "band karo", "बंद", "बंद करो"]);
const START = new Set(["start", "subscribe"]);

function iso(ts: unknown): string {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(Math.min(n * 1000, Date.now())).toISOString();
}

export function parseNotificationWebhook(body: unknown): { statuses: StatusUpdate[]; keywords: KeywordUpdate[] } {
  const statuses: StatusUpdate[] = [];
  const keywords: KeywordUpdate[] = [];
  const root = obj(body);
  if (!root || root.object !== "whatsapp_business_account") return { statuses, keywords };
  for (const e of arr(root.entry)) {
    for (const c of arr(obj(e)?.changes)) {
      const change = obj(c);
      if (!change || change.field !== "messages") continue;
      const value = obj(change.value);
      const accountId = str(obj(value?.metadata)?.phone_number_id);
      if (!value || !accountId) continue;
      for (const s of arr(value.statuses)) {
        const st = obj(s);
        const id = str(st?.id);
        const status = str(st?.status);
        if (!st || !id || id.length > 200 || (status !== "sent" && status !== "delivered" && status !== "read" && status !== "failed")) continue;
        let error: string | null = null;
        if (status === "failed") {
          const err = obj(arr(st.errors)[0]);
          const detail = str(obj(err?.error_data)?.details) ?? str(err?.message) ?? str(err?.title) ?? "WhatsApp couldn't deliver this message";
          const code = str(err?.code);
          error = `${detail}${code ? ` (code ${code})` : ""}`.slice(0, 500);
        }
        statuses.push({ accountId, messageId: id, status, at: iso(st.timestamp), error });
      }
      for (const m of arr(value.messages)) {
        const msg = obj(m);
        const from = str(msg?.from);
        const text = msg?.type === "text" ? str(obj(msg.text)?.body) : msg?.type === "button" ? str(obj(msg.button)?.text) : null;
        if (!from || !text || !/^\d{8,15}$/.test(from)) continue;
        const word = text.trim().toLowerCase();
        if (STOP.has(word)) keywords.push({ accountId, from, optIn: false });
        else if (START.has(word)) keywords.push({ accountId, from, optIn: true });
      }
    }
  }
  return { statuses, keywords };
}
