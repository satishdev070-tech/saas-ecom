"use server";

/**
 * Neural Pulse mutations. Every action: runAction + parseInput, marketing.write and the
 * social_media entitlement (marketingCtx), tenant from membership only. Generations are rate
 * limited per store and logged by runGeneration. API keys never leave the server.
 */
import { refresh } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { marketingCtx } from "@/features/social/server/context";
import { savePostAction } from "@/features/social/actions";
import { normalizeHashtags } from "@/features/social/compose";
import {
  addToCalendarInput,
  brandDraftOutput,
  brandProfileInput,
  captionInput,
  captionOutput,
  ideasInput,
  ideasOutput,
  parseKeywords,
  planInput,
  planOutput,
  type AiProvider,
  type BrandDraft,
  type CaptionSet,
  type ContentIdea,
  type PlanPost,
} from "./schemas";
import { brandDraftPrompt, captionPrompt, ideasPrompt, planPrompt } from "./prompts";
import { getProductBrief, loadPromptContext } from "./server/context";
import { runGeneration } from "./server/generate";

type Meta = { provider: AiProvider; model: string };

export async function saveBrandProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("neuralPulse.brandSave", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(brandProfileInput, { ...formToObject(fd), languages: [...new Set(fd.getAll("languages"))] });
    const { error } = await (await createSupabaseServerClient())
      .from("brand_profiles")
      .upsert({ tenant_id: ctx.tenantId, voice: v.voice ?? null, audience: v.audience ?? null, keywords: parseKeywords(v.keywords), dos: v.dos ?? null, donts: v.donts ?? null, languages: v.languages }, { onConflict: "tenant_id" });
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "neural_pulse.brand_saved", entityType: "brand_profile", entityId: ctx.tenantId, metadata: { languages: v.languages } });
  });
  if (result.ok) refresh();
  return result;
}

/** Drafts a brand profile from the store's name, description, categories and best sellers. Not saved until the seller saves the form. */
export async function autofillBrandAction(): Promise<ActionResult<BrandDraft & Meta>> {
  return runAction("neuralPulse.brandAutofill", async () => {
    const ctx = await marketingCtx();
    const promptCtx = await loadPromptContext(ctx.tenantId, { brand: { voice: null, audience: null, keywords: [], dos: null, donts: null, languages: ["en"] } });
    const r = await runGeneration({ tenantId: ctx.tenantId, userId: ctx.user.id, kind: "profile", input: { source: "store" }, prompt: brandDraftPrompt(promptCtx), schema: brandDraftOutput });
    return { ...r.data, provider: r.provider, model: r.model };
  });
}

export async function generateIdeasAction(input: { focus?: string }): Promise<ActionResult<{ ideas: ContentIdea[] } & Meta>> {
  const result = await runAction("neuralPulse.ideas", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(ideasInput, input);
    const promptCtx = await loadPromptContext(ctx.tenantId);
    const r = await runGeneration({ tenantId: ctx.tenantId, userId: ctx.user.id, kind: "ideas", input: { focus: v.focus ?? null }, prompt: ideasPrompt(promptCtx, v.focus), schema: ideasOutput });
    return { ideas: r.data.ideas.slice(0, 10), provider: r.provider, model: r.model };
  });
  if (result.ok) refresh();
  return result;
}

export async function generateCaptionAction(input: { productId?: string; idea?: string }): Promise<ActionResult<CaptionSet & Meta>> {
  const result = await runAction("neuralPulse.caption", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(captionInput, input);
    const product = v.productId ? await getProductBrief(ctx.tenantId, v.productId) : undefined;
    if (v.productId && !product) throw new AppError("VALIDATION", { fieldErrors: { productId: ["Choose one of your products"] } });
    const promptCtx = await loadPromptContext(ctx.tenantId);
    const r = await runGeneration({ tenantId: ctx.tenantId, userId: ctx.user.id, kind: "caption", input: { productId: v.productId ?? null, idea: v.idea ?? null }, prompt: captionPrompt(promptCtx, { product: product ?? undefined, idea: v.idea }), schema: captionOutput });
    return { ...r.data, hashtags: normalizeHashtags(r.data.hashtags), provider: r.provider, model: r.model };
  });
  if (result.ok) refresh();
  return result;
}

export async function generatePlanAction(input: { weeks: number | string; postsPerWeek: number | string; startDate: string; focus?: string }): Promise<ActionResult<{ posts: PlanPost[] } & Meta>> {
  const result = await runAction("neuralPulse.plan", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(planInput, input);
    const start = Date.parse(`${v.startDate}T00:00:00+05:30`);
    if (Number.isNaN(start) || start < Date.now() - 2 * 86_400_000 || start > Date.now() + 180 * 86_400_000) throw new AppError("VALIDATION", { fieldErrors: { startDate: ["Start between today and 6 months ahead"] } });
    const promptCtx = await loadPromptContext(ctx.tenantId, { datesFrom: new Date(start), dateDays: v.weeks * 7 + 3 });
    const r = await runGeneration({ tenantId: ctx.tenantId, userId: ctx.user.id, kind: "plan", input: { weeks: v.weeks, postsPerWeek: v.postsPerWeek, startDate: v.startDate, focus: v.focus ?? null }, prompt: planPrompt(promptCtx, { weeks: v.weeks, postsPerWeek: v.postsPerWeek, startDate: v.startDate, focus: v.focus }), schema: planOutput });
    // Keep only posts inside the requested window, in date order.
    const endDay = new Date(start + v.weeks * 7 * 86_400_000).toISOString().slice(0, 10);
    const posts = r.data.posts.filter((p) => p.date >= v.startDate && p.date < endDay).sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
    return { posts: posts.map((p) => ({ ...p, hashtags: normalizeHashtags(p.hashtags) })), provider: r.provider, model: r.model };
  });
  if (result.ok) refresh();
  return result;
}

/**
 * Saves generator output to the social planner by calling the planner's own savePostAction for each
 * item (same validation, permissions, audit). "plan" puts dated items on the calendar (never
 * auto-published); undated items, or "draft" mode, become drafts.
 */
export async function addToCalendarAction(input: { mode: "draft" | "plan"; items: unknown[] }): Promise<ActionResult<string>> {
  const result = await runAction("neuralPulse.addToCalendar", async () => {
    await marketingCtx();
    const v = parseInput(addToCalendarInput, input);
    let saved = 0;
    const failed: string[] = [];
    for (const item of v.items) {
      const fd = new FormData();
      fd.set("title", item.title);
      fd.set("caption", item.caption);
      fd.set("hashtags", normalizeHashtags(item.hashtags).join(" "));
      if (item.pillar) fd.set("pillar", item.pillar);
      if (item.notes) fd.set("notes", item.notes);
      for (const c of new Set(item.channels)) fd.append("platforms", c);
      const plan = v.mode === "plan" && item.date;
      fd.set("intent", plan ? "plan" : "draft");
      if (plan) fd.set("scheduledAt", `${item.date}T${item.time ?? "11:00"}`);
      const r = await savePostAction(null, fd);
      if (r.ok) saved++;
      else failed.push(`${item.title.slice(0, 40)}: ${r.error.fieldErrors ? Object.values(r.error.fieldErrors)[0]?.[0] : r.error.message}`);
    }
    if (!saved) throw new AppError("VALIDATION", { fieldErrors: { _form: [`Nothing was added. ${failed.slice(0, 3).join("; ")}`] } });
    const noun = v.mode === "plan" ? "planned on your calendar" : "saved as drafts";
    return `${saved} ${saved === 1 ? "post" : "posts"} ${noun}.${failed.length ? ` ${failed.length} skipped (${failed.slice(0, 2).join("; ")}).` : ""}`;
  });
  if (result.ok) refresh();
  return result;
}
