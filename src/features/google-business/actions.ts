"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { marketingCtx } from "@/features/social/server/context";
import { generateProfileDescription, suggestReviewReply } from "@/features/neural-pulse/server";
import { DESCRIPTION_MAX, REPLY_MAX_BYTES, utf8Bytes, v4LocationName } from "./gbp";
import { getLocation, updateDescription } from "./server/api";
import { disconnectGbp, gbpAccess, loadGbp, updateGbpPublic } from "./server/connection";
import { loadLocationChoices, loadStoreProfile } from "./server/profile";
import { getReviewForSuggest, replyToReview, syncReviews } from "./server/reviews";

/**
 * Google Business Profile mutations. Every action: marketing.write + social_media entitlement
 * (marketingCtx), tenant id from membership, input validated with parseInput, then audit.
 */

const fail = (message: string) => new AppError("CONFLICT", { message });

export async function chooseLocationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("gbp.choose_location", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(z.object({ location: z.string().trim().min(1, "Choose a location").max(200) }), formToObject(fd));
    // Never trust the submitted name: it must be one of the locations Google lists for this connection.
    const choices = await loadLocationChoices(ctx.tenantId);
    if (!choices.ok) throw fail(choices.message);
    const pick = choices.data.find((c) => v4LocationName(c.account, c.location) === v.location);
    if (!pick) throw new AppError("VALIDATION", { fieldErrors: { location: ["Choose one of your Google locations"] } });
    const access = await gbpAccess(ctx.tenantId);
    const loc = access.ok ? await getLocation(access.data.token, v.location) : null;
    await updateGbpPublic(ctx.tenantId, ctx.user.id, {
      location_name: v.location,
      location_title: pick.title,
      place_id: loc?.ok ? loc.data.placeId : null,
      reviews_synced_at: null,
      review_average: null,
      review_total: null,
    });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "integration.social_updated", entityType: "integration", entityId: "google_business", metadata: { location: pick.title } });
  });
  if (result.ok) refresh();
  return result;
}

export async function syncReviewsAction(_prev: ActionResult<number> | null, _fd: FormData): Promise<ActionResult<number>> {
  const result = await runAction("gbp.sync_reviews", async () => {
    const ctx = await marketingCtx();
    await rateLimit("gbp_sync", ctx.tenantId, 10, 3600);
    const r = await syncReviews(ctx.tenantId);
    if (!r.ok) throw fail(r.message);
    // Keep place_id fresh for the review link (cheap: one location read).
    const conn = await loadGbp(ctx.tenantId);
    if (conn?.public.location_name && !conn.public.place_id) {
      const access = await gbpAccess(ctx.tenantId);
      const loc = access.ok ? await getLocation(access.data.token, conn.public.location_name) : null;
      if (loc?.ok && loc.data.placeId) await updateGbpPublic(ctx.tenantId, null, { place_id: loc.data.placeId });
    }
    return r.data.synced;
  });
  if (result.ok) refresh();
  return result;
}

const replySchema = z.object({
  id: z.uuid(),
  reply: z
    .string()
    .trim()
    .min(1, "Write a reply")
    .refine((s) => utf8Bytes(s) <= REPLY_MAX_BYTES, "Replies can be up to 4,096 bytes"),
});

export async function replyReviewAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("gbp.reply", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(replySchema, formToObject(fd));
    await rateLimit("gbp_reply", ctx.tenantId, 60, 3600);
    const r = await replyToReview(ctx.tenantId, v.id, v.reply);
    if (!r.ok) throw fail(r.message);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "gbp.review_replied", entityType: "gbp_review", entityId: v.id, metadata: { length: v.reply.length } });
  });
  if (result.ok) refresh();
  return result;
}

export async function suggestReplyAction(id: string): Promise<ActionResult<string>> {
  return runAction("gbp.suggest_reply", async () => {
    const ctx = await marketingCtx();
    const reviewId = parseInput(z.uuid(), id);
    const review = await getReviewForSuggest(ctx.tenantId, reviewId);
    if (!review) throw fail("That review wasn't found.");
    const r = await suggestReviewReply(ctx.tenantId, { rating: review.star_rating, comment: review.comment, reviewerName: review.reviewer_name });
    if (!r.ok) throw fail(r.message);
    return r.text;
  });
}

export async function generateDescriptionAction(): Promise<ActionResult<string>> {
  return runAction("gbp.generate_description", async () => {
    const ctx = await marketingCtx();
    const store = await loadStoreProfile(ctx.tenantId, ctx.tenantSlug);
    const r = await generateProfileDescription(ctx.tenantId, { storeName: store.name || ctx.tenantName, about: store.description, category: store.category });
    if (!r.ok) throw fail(r.message);
    return r.text.slice(0, DESCRIPTION_MAX);
  });
}

export async function saveDescriptionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("gbp.save_description", async () => {
    const ctx = await marketingCtx();
    const v = parseInput(z.object({ description: z.string().trim().min(1, "Write a description").max(DESCRIPTION_MAX, `Google allows up to ${DESCRIPTION_MAX} characters`) }), formToObject(fd));
    const access = await gbpAccess(ctx.tenantId);
    if (!access.ok) throw fail(access.message);
    if (!access.data.location) throw fail("Choose your Google Business location first.");
    const r = await updateDescription(access.data.token, access.data.location, v.description);
    if (!r.ok) throw fail(r.message);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "gbp.description_updated", entityType: "integration", entityId: "google_business", metadata: { length: v.description.length } });
  });
  if (result.ok) refresh();
  return result;
}

export async function disconnectGbpAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const result = await runAction("gbp.disconnect", async () => {
    const ctx = await marketingCtx();
    const conn = await loadGbp(ctx.tenantId);
    const token = conn?.secrets.refresh_token;
    if (token) {
      // Best effort: revoke the grant at Google too (RFC 7009 endpoint documented by Google OAuth).
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
    }
    await disconnectGbp(ctx.tenantId, ctx.user.id);
  });
  if (result.ok) refresh();
  return result;
}
