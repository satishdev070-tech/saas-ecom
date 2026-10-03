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
import { loadIntegration, updatePublicConfig } from "@/features/integrations/server/store";
import { pinterestBoards } from "./server/providers";
import { ALL_CHANNELS, CONTENT_PILLARS, isAutoPlatform, normalizeHashtags } from "./compose";
import { parseIstInput } from "./planner";
import { claimPost, publishPost } from "./server/publish";
import { marketingCtx } from "./server/context";

const optText = (max: number, msg: string) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max, msg).optional());

const postSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  title: optText(120, "Titles can be up to 120 characters"),
  notes: optText(2000, "Notes can be up to 2,000 characters"),
  pillar: z.preprocess((v) => (v === "" ? undefined : v), z.enum(CONTENT_PILLARS).optional()),
  campaignId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  caption: z.string().trim().max(2200, "Captions can be up to 2,200 characters"),
  hashtags: z.string().max(2000).optional().default(""),
  mediaPath: z.string().max(300).optional().default(""),
  linkUrl: z.preprocess((v) => (v === "" ? undefined : v), z.url({ protocol: /^https$/, message: "Use a full https:// link" }).max(500).optional()),
  platforms: z.array(z.enum(ALL_CHANNELS)).min(1, "Pick at least one channel").max(8),
  intent: z.enum(["draft", "plan", "schedule", "publish"]),
  scheduledAt: z.string().max(40).optional().default(""),
});

const STATUS_FOR_INTENT = { draft: "draft", plan: "planned", schedule: "scheduled", publish: "draft" } as const;

/**
 * Create or update a post, then save as draft, plan it on the calendar (never auto-published),
 * schedule it, or publish immediately. Schedule/publish only auto-publish Facebook, Instagram and
 * Pinterest; planned channels (WhatsApp, X, ...) stay on the calendar for the seller to post.
 */
export async function savePostAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.save", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(postSchema, { ...formToObject(fd), platforms: [...new Set(fd.getAll("platforms"))] });
    if (v.mediaPath && !v.mediaPath.startsWith(`tenant/${ctx.tenantId}/`)) throw new AppError("VALIDATION", { fieldErrors: { mediaPath: ["Choose an image from your media library"] } });
    const auto = v.platforms.filter(isAutoPlatform);
    if ((v.intent === "schedule" || v.intent === "publish") && !auto.length) {
      throw new AppError("VALIDATION", { fieldErrors: { platforms: ["WhatsApp, X, LinkedIn, Threads and YouTube can't be posted automatically. Use Plan to put this on your calendar, or add Facebook, Instagram or Pinterest."] } });
    }
    if ((v.intent === "schedule" || v.intent === "publish") && !v.mediaPath) throw new AppError("VALIDATION", { fieldErrors: { mediaPath: ["Add an image before publishing"] } });
    let scheduledAt: string | null = null;
    if (v.intent === "schedule") {
      const t = parseIstInput(v.scheduledAt);
      if (Number.isNaN(t) || t < Date.now() + 60_000) throw new AppError("VALIDATION", { fieldErrors: { scheduledAt: ["Pick a time at least a minute from now"] } });
      if (t > Date.now() + 90 * 86400_000) throw new AppError("VALIDATION", { fieldErrors: { scheduledAt: ["Schedule up to 90 days ahead"] } });
      scheduledAt = new Date(t).toISOString();
    } else if (v.intent === "plan") {
      const t = parseIstInput(v.scheduledAt);
      if (Number.isNaN(t)) throw new AppError("VALIDATION", { fieldErrors: { scheduledAt: ["Pick a date and time to plan this post"] } });
      if (t < Date.now() - 86400_000) throw new AppError("VALIDATION", { fieldErrors: { scheduledAt: ["Pick a time from yesterday onwards"] } });
      if (t > Date.now() + 365 * 86400_000) throw new AppError("VALIDATION", { fieldErrors: { scheduledAt: ["Plan up to a year ahead"] } });
      scheduledAt = new Date(t).toISOString();
    }
    const supabase = await createSupabaseServerClient();
    if (v.campaignId) {
      const { data, error } = await supabase.from("social_campaigns").select("id").eq("tenant_id", ctx.tenantId).eq("id", v.campaignId).maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw new AppError("VALIDATION", { fieldErrors: { campaignId: ["Choose one of your campaigns"] } });
    }
    const row = {
      title: v.title ?? null,
      notes: v.notes ?? null,
      pillar: v.pillar ?? null,
      campaign_id: v.campaignId ?? null,
      caption: v.caption,
      hashtags: normalizeHashtags(v.hashtags),
      media_paths: v.mediaPath ? [v.mediaPath] : [],
      link_url: v.linkUrl ?? null,
      platforms: v.platforms,
      status: STATUS_FOR_INTENT[v.intent],
      scheduled_at: scheduledAt,
    };
    let id = v.id;
    if (id) {
      const { data, error } = await supabase.from("social_posts").update(row).eq("tenant_id", ctx.tenantId).eq("id", id).in("status", ["draft", "planned", "scheduled", "failed", "cancelled"]).select("id");
      if (error) throw mapDbError(error);
      if (!data?.length) throw new AppError("CONFLICT", { message: "This post is publishing or already published and can't be edited." });
    } else {
      const { data, error } = await supabase.from("social_posts").insert({ ...row, tenant_id: ctx.tenantId, created_by: ctx.user.id }).select("id").single();
      if (error) throw mapDbError(error);
      id = data.id;
    }
    const action = v.intent === "schedule" ? "social.post_scheduled" : v.intent === "plan" ? "social.post_planned" : "social.post_saved";
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action, entityType: "social_post", entityId: id!, metadata: { platforms: v.platforms, scheduled_at: scheduledAt, campaign_id: v.campaignId ?? null } });
    const manualNote = auto.length < v.platforms.length ? " Planned channels stay on your calendar to post yourself." : "";
    if (v.intent === "publish") {
      await rateLimit("social-publish", ctx.tenantId, 30, 3600);
      if (!(await claimPost(ctx.tenantId, id!, ["draft", "failed"]))) throw new AppError("CONFLICT", { message: "This post is already being published." });
      const r = await publishPost(ctx.tenantId, id!, ctx.user.id);
      const failed = auto.filter((p) => !r.results[p]?.ok);
      if (r.status === "failed") throw new AppError("VALIDATION", { message: `Not published: ${failed.map((p) => `${p} (${r.results[p]?.error ?? "error"})`).join("; ")}` });
      return (failed.length ? `Published, except ${failed.join(", ")}. See the post for details.` : "Published.") + manualNote;
    }
    if (v.intent === "schedule") return `Scheduled.${manualNote}`;
    return v.intent === "plan" ? "Planned. It's on your calendar (not posted automatically)." : "Draft saved.";
  });
  if (result.ok) refresh();
  return result;
}

const idSchema = z.object({ id: z.uuid() });

export async function cancelPostAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.cancel", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    const { data, error } = await (await createSupabaseServerClient()).from("social_posts").update({ status: "cancelled" }).eq("tenant_id", ctx.tenantId).eq("id", id).eq("status", "scheduled").select("id");
    if (error) throw mapDbError(error);
    if (!data?.length) throw new AppError("CONFLICT", { message: "Only scheduled posts can be cancelled." });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.post_cancelled", entityType: "social_post", entityId: id });
  });
  if (result.ok) refresh();
  return result;
}

export async function deletePostAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.delete", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("social_posts").delete().eq("tenant_id", ctx.tenantId).eq("id", id).in("status", ["draft", "planned", "cancelled", "failed"]);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function retryPostAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.retry", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    await rateLimit("social-publish", ctx.tenantId, 30, 3600);
    if (!(await claimPost(ctx.tenantId, id, ["failed"]))) throw new AppError("CONFLICT", { message: "Only failed posts can be retried." });
    const r = await publishPost(ctx.tenantId, id, ctx.user.id);
    return r.status === "published" ? "Published." : "Still failing. Check each network's error below.";
  });
  refresh();
  return result;
}

export async function setPinterestBoardAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.pinterestBoard", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(z.object({ boardId: z.string().regex(/^[0-9]{1,30}$/) }), formToObject(fd));
    // The board must be one of the connected account's own boards.
    const it = await loadIntegration(ctx.tenantId, "pinterest");
    const boards = it?.secrets.access_token ? await pinterestBoards(it.secrets.access_token) : null;
    const board = boards?.ok ? boards.data.find((b) => b.id === v.boardId) : undefined;
    if (!board) throw new AppError("VALIDATION", { fieldErrors: { boardId: ["Choose one of your Pinterest boards"] } });
    await updatePublicConfig(ctx, "pinterest", { board_id: board.id, board_name: board.name });
  });
  if (result.ok) refresh();
  return result;
}
