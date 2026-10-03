import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import type { InboxChannel } from "../webhook";

/** Inbox reads through RLS (marketing.read on the caller's own store). */
export type ConversationRow = {
  id: string;
  channel: InboxChannel;
  participantId: string;
  participantName: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastPreview: string | null;
  unread: number;
  status: "open" | "closed";
};
export type MessageRow = { id: string; direction: "in" | "out"; body: string; mediaUrl: string | null; status: "received" | "sending" | "sent" | "failed"; error: string | null; sentAt: string };
export type InboxFilters = { channel?: InboxChannel; status?: "open" | "closed" | "all"; unread?: boolean; q?: string };

const COLS = "id, channel, participant_id, participant_name, last_message_at, last_inbound_at, last_preview, unread_count, status";
type Raw = { id: string; channel: string; participant_id: string; participant_name: string | null; last_message_at: string | null; last_inbound_at: string | null; last_preview: string | null; unread_count: number; status: string };
const map = (r: Raw): ConversationRow => ({ id: r.id, channel: r.channel as InboxChannel, participantId: r.participant_id, participantName: r.participant_name, lastMessageAt: r.last_message_at, lastInboundAt: r.last_inbound_at, lastPreview: r.last_preview, unread: r.unread_count, status: r.status === "closed" ? "closed" : "open" });

export async function listConversations(tenantId: string, f: InboxFilters): Promise<ConversationRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("social_conversations").select(COLS).eq("tenant_id", tenantId);
  if (f.channel) q = q.eq("channel", f.channel);
  if (f.status !== "all") q = q.eq("status", f.status ?? "open");
  if (f.unread) q = q.gt("unread_count", 0);
  if (f.q) {
    const term = f.q.replace(/[%_,()*\\]/g, " ").trim();
    if (term) q = q.or(`participant_name.ilike.%${term}%,last_preview.ilike.%${term}%`);
  }
  const { data, error } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100).returns<Raw[]>();
  if (error) throw mapDbError(error);
  return (data ?? []).map(map);
}

export async function unreadByChannel(tenantId: string): Promise<Record<InboxChannel, number>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("social_conversations").select("channel, unread_count").eq("tenant_id", tenantId).gt("unread_count", 0).limit(1000);
  const out: Record<InboxChannel, number> = { facebook: 0, instagram: 0, whatsapp: 0 };
  for (const r of data ?? []) if (r.channel in out) out[r.channel as InboxChannel] += r.unread_count;
  return out;
}

export async function getThread(tenantId: string, conversationId: string): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: conv, error } = await supabase.from("social_conversations").select(COLS).eq("tenant_id", tenantId).eq("id", conversationId).maybeSingle<Raw>();
  if (error) throw mapDbError(error);
  if (!conv) return null;
  const { data: msgs, error: mErr } = await supabase
    .from("social_messages")
    .select("id, direction, body, media_url, status, error, sent_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(200);
  if (mErr) throw mapDbError(mErr);
  const messages = (msgs ?? [])
    .reverse()
    .map((m) => ({ id: m.id, direction: m.direction === "out" ? "out" : "in", body: m.body, mediaUrl: m.media_url, status: m.status as MessageRow["status"], error: m.error, sentAt: m.sent_at }) satisfies MessageRow);
  return { conversation: map(conv), messages };
}
