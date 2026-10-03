import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { messageReplyPrompt, profileDescriptionPrompt, reviewReplyPrompt, type Prompt } from "../prompts";
import { profileDescriptionOutput, replyOutput, type AiProvider, type GenerationKind } from "../schemas";
import { loadPromptContext } from "./context";
import { FAILED_MESSAGE, LIMIT_MESSAGE, SETUP_MESSAGE, runGeneration } from "./generate";

export { configuredProviders } from "./generate";
export { countGenerationsToday, getBrandProfile, listGenerations } from "./context";

/** Result for helpers used by other features (inbox, Google reviews). `message` is safe to show. */
export type SuggestResult = { ok: true; text: string; provider: AiProvider; model: string } | { ok: false; reason: "not_configured" | "rate_limited" | "failed"; message: string };

/** Signed-in member of exactly this tenant with marketing.write. Never trusts the tenant id alone. */
async function authorize(tenantId: string) {
  const ctx = await requireTenant();
  if (ctx.tenantId !== tenantId) throw new AppError("FORBIDDEN", { context: { reason: "tenant_mismatch" } });
  assertPermission(ctx, "marketing.write");
  return ctx;
}

async function suggest(tenantId: string, kind: GenerationKind, input: Record<string, unknown>, build: (ctx: Awaited<ReturnType<typeof loadPromptContext>>) => Prompt, pick: "reply" | "description"): Promise<SuggestResult> {
  const ctx = await authorize(tenantId);
  try {
    const promptCtx = await loadPromptContext(tenantId);
    const schema = pick === "reply" ? replyOutput : profileDescriptionOutput;
    const r = await runGeneration({ tenantId, userId: ctx.user.id, kind, input, prompt: build(promptCtx), schema });
    const text = "reply" in r.data ? r.data.reply : r.data.description;
    return { ok: true, text, provider: r.provider, model: r.model };
  } catch (err) {
    if (err instanceof AppError) {
      const msg = err.fieldErrors?._form?.[0];
      if (msg === SETUP_MESSAGE) return { ok: false, reason: "not_configured", message: SETUP_MESSAGE };
      if (err.code === "RATE_LIMITED") return { ok: false, reason: "rate_limited", message: LIMIT_MESSAGE };
      if (err.code === "INTERNAL") return { ok: false, reason: "failed", message: FAILED_MESSAGE };
      throw err;
    }
    logger.error("neural_pulse.suggest_failed", { tenantId, kind, error: err });
    return { ok: false, reason: "failed", message: FAILED_MESSAGE };
  }
}

/** Draft reply (not sent) to the latest messages of a social inbox conversation. */
export async function suggestMessageReply(tenantId: string, conversationId: string): Promise<SuggestResult> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new AppError("NOT_FOUND");
  await authorize(tenantId);
  const supabase = await createSupabaseServerClient();
  const { data: convo, error } = await supabase.from("social_conversations").select("id, channel").eq("tenant_id", tenantId).eq("id", conversationId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!convo) throw new AppError("NOT_FOUND");
  const { data: rows, error: msgErr } = await supabase.from("social_messages").select("direction, body, sent_at").eq("tenant_id", tenantId).eq("conversation_id", conversationId).order("sent_at", { ascending: false }).limit(12);
  if (msgErr) throw mapDbError(msgErr);
  const messages = (rows ?? []).reverse().map((m) => ({ direction: m.direction === "out" ? ("out" as const) : ("in" as const), body: m.body }));
  if (!messages.some((m) => m.direction === "in")) return { ok: false, reason: "failed", message: "There's no customer message to reply to yet." };
  return suggest(tenantId, "message_reply", { conversationId, channel: convo.channel, messages: messages.length }, (c) => messageReplyPrompt(c, convo.channel, messages), "reply");
}

/** Draft public reply to a review (Google Business Profile or store reviews). */
export async function suggestReviewReply(tenantId: string, review: { rating: number | null; comment: string | null; reviewerName: string | null }): Promise<SuggestResult> {
  return suggest(tenantId, "review_reply", { rating: review.rating, hasComment: !!review.comment }, (c) => reviewReplyPrompt(c, review), "reply");
}

/** Google Business Profile description draft (max 750 characters). */
export async function generateProfileDescription(tenantId: string, input: { storeName: string; about: string | null; category: string | null }): Promise<SuggestResult> {
  return suggest(tenantId, "profile", { target: "google_business_description", category: input.category }, (c) => profileDescriptionPrompt(c, input), "description");
}
