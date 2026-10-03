"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { loadIntegration } from "@/features/integrations/server/store";
import { marketingCtx } from "@/features/social/server/context";
import { suggestMessageReply } from "@/features/neural-pulse/server";
import { sendReply } from "./server/send";
import { connectWhatsApp, disconnectWhatsApp } from "./server/whatsapp";
import { subscribePage } from "./server/graph";

/** Inbox mutations: tenant from membership, marketing.write + social_media entitlement (marketingCtx). */

const idSchema = z.object({ conversationId: z.uuid() });
const replySchema = idSchema.extend({ body: z.string().trim().min(1, "Write a reply").max(2000, "Replies can be up to 2,000 characters") });

export async function sendReplyAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("inbox.send", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(replySchema, formToObject(fd));
    const r = await sendReply(ctx, v.conversationId, v.body);
    if (r.status === "failed") throw new AppError("VALIDATION", { message: `Not sent: ${r.error ?? "unknown error"}` });
    return "Sent.";
  });
  refresh();
  return result;
}

export async function markReadAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("inbox.read", async () => {
    const ctx = await marketingCtx();
    const { conversationId } = parseInput(idSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("social_conversations").update({ unread_count: 0 }).eq("tenant_id", ctx.tenantId).eq("id", conversationId).gt("unread_count", 0);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function setConversationStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("inbox.status", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(idSchema.extend({ status: z.enum(["open", "closed"]) }), formToObject(fd));
    const { data, error } = await (await createSupabaseServerClient()).from("social_conversations").update({ status: v.status, ...(v.status === "closed" ? { unread_count: 0 } : {}) }).eq("tenant_id", ctx.tenantId).eq("id", v.conversationId).select("id");
    if (error) throw mapDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND", { message: "Conversation not found." });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: v.status === "closed" ? "inbox.conversation_closed" : "inbox.conversation_reopened", entityType: "social_conversation", entityId: v.conversationId });
  });
  if (result.ok) refresh();
  return result;
}

/** Drafts a reply with Neural Pulse (nothing is sent). */
export async function suggestReplyAction(conversationId: string): Promise<ActionResult<string>> {
  return runAction("inbox.suggest", async () => {
    const ctx = await marketingCtx();
    const { conversationId: id } = parseInput(idSchema, { conversationId });
    const r = await suggestMessageReply(ctx.tenantId, id);
    if (!r.ok) throw new AppError(r.reason === "rate_limited" ? "RATE_LIMITED" : "VALIDATION", { message: r.message });
    return r.text;
  });
}

const waSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^[0-9]{6,25}$/, "The phone number ID is a long number (not the phone number itself)"),
  wabaId: z.string().trim().regex(/^[0-9]{6,25}$/, "The WhatsApp Business Account ID is a long number"),
  token: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(1000, "That token is too long").regex(/^[A-Za-z0-9_\-.|]*$/, "Paste the token exactly as shown (no spaces)")),
});

export async function connectWhatsAppAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("inbox.whatsappConnect", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(waSchema, formToObject(fd));
    if (v.token && v.token.length < 20) throw new AppError("VALIDATION", { fieldErrors: { token: ["That doesn't look like an access token"] } });
    await rateLimit("inbox-whatsapp-connect", ctx.tenantId, 10, 3600);
    const r = await connectWhatsApp(ctx, v);
    const who = [r.accountName, r.displayPhone].filter(Boolean).join(" · ");
    return `Connected${who ? `: ${who}` : ""}.${r.webhookNote ? ` Messages may not arrive yet: subscribing to webhooks failed (${r.webhookNote})` : ""}`;
  });
  if (result.ok) refresh();
  return result;
}

export async function disconnectWhatsAppAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const result = await runAction("inbox.whatsappDisconnect", async () => {
    const ctx = await marketingCtx();
    await disconnectWhatsApp(ctx);
  });
  if (result.ok) refresh();
  return result;
}

/** Subscribes the connected Facebook Page to message webhooks (needed for Messenger and Instagram DMs). */
export async function subscribePageAction(_prev: ActionResult<string> | null, _fd: FormData): Promise<ActionResult<string>> {
  return runAction("inbox.subscribePage", async () => {
    const ctx = await marketingCtx();
    await rateLimit("inbox-subscribe", ctx.tenantId, 10, 3600);
    const it = await loadIntegration(ctx.tenantId, "facebook");
    if (!it || it.status !== "connected" || !it.public.account_id || !it.secrets.page_token) throw new AppError("CONFLICT", { message: "Connect Facebook & Instagram in Social → Accounts first." });
    const r = await subscribePage(it.public.account_id, it.secrets.page_token);
    if (!r.ok) throw new AppError("VALIDATION", { message: r.message });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inbox.page_subscribed", entityType: "integration", entityId: "facebook" });
    return "Your Page now sends new messages to this inbox.";
  });
}
