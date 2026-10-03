"use server";

/**
 * Social planner mutations: campaigns, hashtag sets, key dates, calendar moves, planned-channel
 * "posted" marks, and product-to-post. Every action: runAction + parseInput, marketing.write and
 * the social_media entitlement (marketingCtx), tenant from membership only, RLS server client,
 * audit on writes.
 */
import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { formatMoney, toMinor } from "@/lib/money";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { storePrimaryHost } from "@/features/integrations/server/store";
import { MANUAL_CHANNELS, isAutoPlatform, normalizeHashtags } from "./compose";
import { buildUtmLink, parseIstInput } from "./planner";
import { marketingCtx } from "./server/context";

const DAY_MS = 86_400_000;
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optUuid = z.preprocess(blank, z.uuid().optional());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Use a valid date");
const optDay = z.preprocess(blank, day.optional());
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const idSchema = z.object({ id: z.uuid() });

/** Insert or (tenant-scoped) update; returns the row id. */
async function upsertRow(table: "social_campaigns" | "social_hashtag_sets" | "marketing_dates", tenantId: string, id: string | undefined, row: Record<string, unknown>): Promise<string> {
  const supabase = await createSupabaseServerClient();
  if (id) {
    const { data, error } = await supabase.from(table).update(row as never).eq("tenant_id", tenantId).eq("id", id).select("id");
    if (error) throw mapDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND", { message: "This item no longer exists." });
    return id;
  }
  const { data, error } = await supabase.from(table).insert({ ...row, tenant_id: tenantId } as never).select("id").single();
  if (error) throw mapDbError(error);
  return (data as { id: string }).id;
}

async function deleteRow(table: "social_campaigns" | "social_hashtag_sets" | "marketing_dates", tenantId: string, id: string) {
  const { data, error } = await (await createSupabaseServerClient()).from(table).delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw mapDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND", { message: "This item no longer exists." });
}

// ---------- Campaigns ----------

const campaignSchema = z
  .object({
    id: optUuid,
    name: z.string().trim().min(1, "Give the campaign a name").max(80, "Up to 80 characters"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
    goal: optText(300),
    startsOn: optDay,
    endsOn: optDay,
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "The end date must be on or after the start date" });

export async function saveCampaignAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.campaignSave", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(campaignSchema, formToObject(fd));
    const id = await upsertRow("social_campaigns", ctx.tenantId, v.id, { name: v.name, color: v.color.toLowerCase(), goal: v.goal ?? null, starts_on: v.startsOn ?? null, ends_on: v.endsOn ?? null });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.campaign_saved", entityType: "social_campaign", entityId: id, metadata: { name: v.name } });
    return id;
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteCampaignAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.campaignDelete", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    await deleteRow("social_campaigns", ctx.tenantId, id); // posts keep their content; campaign_id is set null by the FK
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.campaign_deleted", entityType: "social_campaign", entityId: id });
  });
  if (result.ok) refresh();
  return result;
}

// ---------- Hashtag sets ----------

const hashtagSetSchema = z.object({ id: optUuid, name: z.string().trim().min(1, "Give the set a name").max(60, "Up to 60 characters"), tags: z.string().max(2000).optional().default("") });

export async function saveHashtagSetAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.hashtagSetSave", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(hashtagSetSchema, formToObject(fd));
    const tags = normalizeHashtags(v.tags);
    if (!tags.length) throw new AppError("VALIDATION", { fieldErrors: { tags: ["Add at least one hashtag"] } });
    const id = await upsertRow("social_hashtag_sets", ctx.tenantId, v.id, { name: v.name, tags });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.hashtag_set_saved", entityType: "social_hashtag_set", entityId: id, metadata: { count: tags.length } });
    return id;
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteHashtagSetAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.hashtagSetDelete", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    await deleteRow("social_hashtag_sets", ctx.tenantId, id);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.hashtag_set_deleted", entityType: "social_hashtag_set", entityId: id });
  });
  if (result.ok) refresh();
  return result;
}

// ---------- Key dates ----------

const dateSchema = z.object({
  id: optUuid,
  title: z.string().trim().min(1, "Give the date a title").max(80, "Up to 80 characters"),
  onDate: day,
  kind: z.enum(["sale", "launch", "festival", "other"]).default("other"),
  notes: optText(500),
});

export async function saveMarketingDateAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.dateSave", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(dateSchema, formToObject(fd));
    const id = await upsertRow("marketing_dates", ctx.tenantId, v.id, { title: v.title, on_date: v.onDate, kind: v.kind, notes: v.notes ?? null });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.date_saved", entityType: "marketing_date", entityId: id, metadata: { on_date: v.onDate, kind: v.kind } });
    return id;
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteMarketingDateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.dateDelete", async () => {
    const ctx = await marketingCtx();
    const { id } = parseInput(idSchema, formToObject(fd));
    await deleteRow("marketing_dates", ctx.tenantId, id);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.date_deleted", entityType: "marketing_date", entityId: id });
  });
  if (result.ok) refresh();
  return result;
}

// ---------- Calendar ----------

/** Drag-and-drop: draft/planned/scheduled only. A dated draft becomes planned; a scheduled post keeps the 1 min–90 day window. */
export async function reschedulePostAction(id: string, at: string): Promise<ActionResult> {
  const result = await runAction("social.reschedule", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(z.object({ id: z.uuid(), at: z.string().trim().min(1).max(40) }), { id, at });
    const t = parseIstInput(v.at);
    if (Number.isNaN(t)) throw new AppError("VALIDATION", { fieldErrors: { at: ["Pick a valid date and time"] } });
    const supabase = await createSupabaseServerClient();
    const { data: post, error } = await supabase.from("social_posts").select("id, status").eq("tenant_id", ctx.tenantId).eq("id", v.id).maybeSingle();
    if (error) throw mapDbError(error);
    if (!post) throw new AppError("NOT_FOUND", { message: "This post no longer exists." });
    if (!["draft", "planned", "scheduled"].includes(post.status)) throw new AppError("CONFLICT", { message: "Only drafts, planned and scheduled posts can be moved." });
    if (post.status === "scheduled") {
      if (t < Date.now() + 60_000) throw new AppError("VALIDATION", { fieldErrors: { at: ["Scheduled posts must stay at least a minute in the future"] } });
      if (t > Date.now() + 90 * DAY_MS) throw new AppError("VALIDATION", { fieldErrors: { at: ["Schedule up to 90 days ahead"] } });
    } else {
      if (t < Date.now() - DAY_MS) throw new AppError("VALIDATION", { fieldErrors: { at: ["Pick a time from yesterday onwards"] } });
      if (t > Date.now() + 365 * DAY_MS) throw new AppError("VALIDATION", { fieldErrors: { at: ["Plan up to a year ahead"] } });
    }
    const status = post.status === "draft" ? "planned" : post.status;
    const scheduledAt = new Date(t).toISOString();
    // Conditional on the status we read, so a post claimed by the cron meanwhile is never moved.
    const { data, error: upErr } = await supabase.from("social_posts").update({ scheduled_at: scheduledAt, status }).eq("tenant_id", ctx.tenantId).eq("id", v.id).eq("status", post.status).select("id");
    if (upErr) throw mapDbError(upErr);
    if (!data?.length) throw new AppError("CONFLICT", { message: "This post changed meanwhile. Refresh and try again." });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.post_rescheduled", entityType: "social_post", entityId: v.id, metadata: { scheduled_at: scheduledAt, status } });
  });
  if (result.ok) refresh();
  return result;
}

const markSchema = z.object({ id: z.uuid(), channel: z.enum(MANUAL_CHANNELS), undo: z.preprocess((v) => v === "1" || v === "true", z.boolean()) });

/** Marks (or with undo=1 unmarks) a planned channel as posted by the seller. Nothing is posted by us. */
export async function markChannelPostedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("social.markPosted", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(markSchema, { ...formToObject(fd), undo: fd.get("undo") ?? "" });
    const supabase = await createSupabaseServerClient();
    const { data: post, error } = await supabase.from("social_posts").select("platforms, manual_done, status, updated_at").eq("tenant_id", ctx.tenantId).eq("id", v.id).maybeSingle();
    if (error) throw mapDbError(error);
    if (!post) throw new AppError("NOT_FOUND", { message: "This post no longer exists." });
    if (!post.platforms.includes(v.channel) || isAutoPlatform(v.channel)) throw new AppError("VALIDATION", { fieldErrors: { channel: ["This channel isn't planned for this post"] } });
    if (post.status === "cancelled") throw new AppError("CONFLICT", { message: "This post was cancelled." });
    const done = v.undo ? post.manual_done.filter((c) => c !== v.channel) : [...new Set([...post.manual_done, v.channel])];
    // Optimistic concurrency on updated_at so two quick toggles don't overwrite each other.
    const { data, error: upErr } = await supabase.from("social_posts").update({ manual_done: done }).eq("tenant_id", ctx.tenantId).eq("id", v.id).eq("updated_at", post.updated_at).select("id");
    if (upErr) throw mapDbError(upErr);
    if (!data?.length) throw new AppError("CONFLICT", { message: "This post changed meanwhile. Refresh and try again." });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: v.undo ? "social.channel_unmarked" : "social.channel_marked_posted", entityType: "social_post", entityId: v.id, metadata: { channel: v.channel } });
  });
  if (result.ok) refresh();
  return result;
}

// ---------- Product to post ----------

export async function createPostFromProductAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("social.fromProduct", async () => {
    const ctx = await marketingCtx();
    const { productId } = parseInput(z.object({ productId: z.uuid() }), formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const [{ data: product, error }, { data: media, error: mediaErr }] = await Promise.all([
      supabase.from("products").select("id, title, slug, short_description, min_price, status").eq("tenant_id", ctx.tenantId).eq("id", productId).maybeSingle(),
      supabase.from("product_media").select("storage_path").eq("tenant_id", ctx.tenantId).eq("product_id", productId).eq("media_type", "image").order("position").limit(1),
    ]);
    if (error) throw mapDbError(error);
    if (mediaErr) throw mapDbError(mediaErr);
    if (!product || product.status === "archived") throw new AppError("NOT_FOUND", { message: "Choose one of your products." });
    // numeric(12,2) from PostgREST -> integer paise; formatting only for display.
    const price = product.min_price == null ? null : formatMoney(toMinor(product.min_price));
    const caption = [product.title.trim(), product.short_description?.trim(), price].filter(Boolean).join("\n\n").slice(0, 2200);
    const host = (await storePrimaryHost(ctx.tenantId)) ?? storeSubdomain(ctx.tenantSlug);
    const link = buildUtmLink(storeOrigin(host), product.slug);
    const image = media?.[0]?.storage_path ?? null;
    const { data, error: insErr } = await supabase
      .from("social_posts")
      .insert({
        tenant_id: ctx.tenantId,
        created_by: ctx.user.id,
        product_id: product.id,
        title: product.title.slice(0, 120),
        caption,
        link_url: link.length <= 500 && link.startsWith("https://") ? link : null,
        media_paths: image && image.startsWith(`tenant/${ctx.tenantId}/`) ? [image] : [],
        pillar: "product",
        status: "draft",
        platforms: [],
      })
      .select("id")
      .single();
    if (insErr) throw mapDbError(insErr);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "social.post_from_product", entityType: "social_post", entityId: data.id, metadata: { product_id: product.id } });
    return data.id;
  });
  if (result.ok) refresh();
  return result;
}
