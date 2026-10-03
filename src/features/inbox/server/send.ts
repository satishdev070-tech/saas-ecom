import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/observability/logger";
import { assertPermission, type TenantContext } from "@/lib/tenant/membership";
import { loadIntegration } from "@/features/integrations/server/store";
import { clip, type InboxChannel } from "../webhook";
import { serviceWindow, windowClosedMessage } from "../window";
import { sendPageMessage, sendWhatsAppText, type GraphResult } from "./graph";
import { activeWhatsApp, markWhatsAppExpired } from "./whatsapp";

/**
 * Sends a free-form reply. The conversation is read through RLS (the caller's own store), the
 * 24-hour customer-service window is enforced before calling the provider, and the message row is
 * recorded as sending → sent | failed with the provider's message id (secret-key client: staff have
 * no INSERT grant on social_messages; the permission check happened first).
 */
export async function sendReply(ctx: TenantContext, conversationId: string, text: string): Promise<{ status: "sent" | "failed"; error: string | null }> {
  assertPermission(ctx, "marketing.write");
  const supabase = await createSupabaseServerClient();
  const { data: conv, error } = await supabase.from("social_conversations").select("id, channel, participant_id, last_inbound_at").eq("tenant_id", ctx.tenantId).eq("id", conversationId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!conv) throw new AppError("NOT_FOUND", { message: "Conversation not found." });
  const channel = conv.channel as InboxChannel;
  if (!serviceWindow(conv.last_inbound_at).open) throw new AppError("CONFLICT", { message: windowClosedMessage(channel) });
  await rateLimit("inbox-send", ctx.tenantId, 300, 3600);

  const admin = createSupabaseAdminClient();
  const { data: row, error: insErr } = await admin.from("social_messages").insert({ tenant_id: ctx.tenantId, conversation_id: conv.id, direction: "out", body: text, status: "sending", sent_by: ctx.user.id }).select("id").single();
  if (insErr) throw mapDbError(insErr);

  let result: GraphResult<{ id: string }>;
  if (channel === "whatsapp") {
    const wa = await activeWhatsApp(ctx.tenantId);
    result = wa ? await sendWhatsAppText(wa.phoneNumberId, wa.token, conv.participant_id, text) : { ok: false, message: "WhatsApp isn't connected. Connect it in the inbox settings." };
    if (!result.ok && wa && /expired or was revoked/.test(result.message)) await markWhatsAppExpired(ctx.tenantId, result.message);
  } else {
    const it = await loadIntegration(ctx.tenantId, channel);
    const pageId = channel === "facebook" ? it?.public.account_id : it?.public.page_id;
    const token = it?.secrets.page_token;
    result = it?.status === "connected" && pageId && token ? await sendPageMessage(pageId, token, conv.participant_id, text, channel === "facebook" ? "Messenger" : "Instagram") : { ok: false, message: `${channel === "facebook" ? "Facebook" : "Instagram"} isn't connected. Connect it in Social → Accounts.` };
  }

  const now = new Date().toISOString();
  if (result.ok) {
    const { error: upErr } = await admin.from("social_messages").update({ status: "sent", external_id: result.data.id, sent_at: now }).eq("tenant_id", ctx.tenantId).eq("id", row.id);
    // The echo webhook may already have stored this message under the same id: keep that row.
    if (upErr?.code === "23505") await admin.from("social_messages").delete().eq("tenant_id", ctx.tenantId).eq("id", row.id);
    else if (upErr) logger.error("inbox.reply_update_failed", { tenantId: ctx.tenantId, error: upErr });
    await admin.from("social_conversations").update({ last_message_at: now, last_preview: clip(text, 300), unread_count: 0 }).eq("tenant_id", ctx.tenantId).eq("id", conv.id);
  } else {
    await admin.from("social_messages").update({ status: "failed", error: result.message.slice(0, 500) }).eq("tenant_id", ctx.tenantId).eq("id", row.id);
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: result.ok ? "inbox.reply_sent" : "inbox.reply_failed", entityType: "social_conversation", entityId: conv.id, metadata: { channel } });
  return result.ok ? { status: "sent", error: null } : { status: "failed", error: result.message };
}
