import "server-only";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assetUrl, STORE_ASSETS_BUCKET } from "@/lib/storage/assets";
import { logger } from "@/lib/observability/logger";
import { audit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import { activeIntegration, recordStatus, updateOAuthSecrets } from "@/features/integrations/server/store";
import { composeText, isAutoPlatform, overallStatus, type PlatformResult, type SocialPlatform } from "../compose";
import { createPin, pinterestRefresh, publishFacebookPhoto, publishInstagramImage, type Result } from "./providers";
import { publishGoogleLocalPost } from "@/features/google-business/server/publish";

/**
 * Publishes one post to its selected auto-publish platforms (manual channels are skipped). Called by "Publish now" (after the seller's
 * permission check) and by the scheduler cron. The caller must first CLAIM the post by moving it
 * to status 'publishing' (see claimPost) so two workers never publish the same post twice.
 * Tenant id always comes from the claimed row, never from the request.
 */

export async function claimPost(tenantId: string, postId: string, from: ("draft" | "scheduled" | "failed")[]): Promise<boolean> {
  const { data } = await createSupabaseAdminClient().from("social_posts").update({ status: "publishing" }).eq("tenant_id", tenantId).eq("id", postId).in("status", from).select("id");
  return Boolean(data?.length);
}

/** Instagram accepts JPEG only: convert (max 1440 px wide) and store beside the original. */
async function jpegUrl(tenantId: string, postId: string, path: string): Promise<string | null> {
  const src = assetUrl(path);
  if (!src) return null;
  if (/\.jpe?g$/i.test(path)) return src;
  const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const jpg = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 1440, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  const out = `tenant/${tenantId}/social/${postId}.jpg`;
  const { error } = await createSupabaseAdminClient().storage.from(STORE_ASSETS_BUCKET).upload(out, jpg, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  return error ? null : assetUrl(out);
}

async function pinterestToken(tenantId: string): Promise<{ token: string; board: string | null } | null> {
  const it = await activeIntegration(tenantId, "pinterest");
  if (!it?.secrets.access_token) return null;
  let token = it.secrets.access_token;
  if (it.expiresAt && Date.parse(it.expiresAt) < Date.now() + 5 * 60_000 && it.secrets.refresh_token) {
    const r = await pinterestRefresh(it.secrets.refresh_token);
    if (!r.ok) {
      await recordStatus(tenantId, "pinterest", "expired", r.message);
      return null;
    }
    token = r.data.accessToken;
    await updateOAuthSecrets(tenantId, "pinterest", { access_token: token, refresh_token: r.data.refreshToken ?? it.secrets.refresh_token }, r.data.expiresAt);
  }
  return { token, board: it.public.board_id ?? null };
}

export async function publishPost(tenantId: string, postId: string, actorUserId: string | null): Promise<{ status: "published" | "failed"; results: Partial<Record<SocialPlatform, PlatformResult>> }> {
  const admin = createSupabaseAdminClient();
  const { data: post } = await admin.from("social_posts").select("id, caption, hashtags, media_paths, link_url, platforms, results, product_id").eq("tenant_id", tenantId).eq("id", postId).single();
  if (!post) throw new Error("post not found");
  // Only auto-published networks; planned (manual) channels are marked posted by the seller.
  const platforms: SocialPlatform[] = post.platforms.filter(isAutoPlatform);
  const results: Partial<Record<SocialPlatform, PlatformResult>> = { ...((post.results ?? {}) as Partial<Record<SocialPlatform, PlatformResult>>) };
  const now = () => new Date().toISOString();
  const image = post.media_paths[0] ?? null;
  const imageUrl = assetUrl(image);
  const base = { caption: post.caption, hashtags: post.hashtags, link: post.link_url };

  for (const p of platforms) {
    if (results[p]?.ok) continue; // already published on an earlier attempt: never double-post
    let r: Result<{ id: string; url: string | null }>;
    try {
      if (p === "google") r = await publishGoogleLocalPost(tenantId, { caption: post.caption, link: post.link_url, imageUrl });
      else if (!imageUrl) r = { ok: false, message: "Add an image: all three networks need one." };
      else if (p === "facebook") {
        const it = await activeIntegration(tenantId, "facebook");
        r = it?.secrets.page_token ? await publishFacebookPhoto(it.public.account_id!, it.secrets.page_token, imageUrl, composeText(base, "facebook")) : { ok: false, message: "Facebook isn't connected." };
        if (!r.ok && r.expired) await recordStatus(tenantId, "facebook", "expired", r.message);
      } else if (p === "instagram") {
        const it = await activeIntegration(tenantId, "instagram");
        const jpg = it ? await jpegUrl(tenantId, postId, image!) : null;
        r = !it?.secrets.page_token ? { ok: false, message: "Instagram isn't connected." } : !jpg ? { ok: false, message: "The image couldn't be prepared for Instagram." } : await publishInstagramImage(it.public.account_id!, it.secrets.page_token, jpg, composeText(base, "instagram"));
        if (!r.ok && r.expired) await recordStatus(tenantId, "instagram", "expired", r.message);
      } else {
        const pt = await pinterestToken(tenantId);
        r = !pt ? { ok: false, message: "Pinterest isn't connected." } : !pt.board ? { ok: false, message: "Choose a Pinterest board in the social settings." } : await createPin(pt.token, { boardId: pt.board, title: post.caption.split("\n")[0]!.slice(0, 100) || "New arrival", description: composeText(base, "pinterest"), link: post.link_url, imageUrl, altText: post.caption.slice(0, 200) });
        if (!r.ok && r.expired) await recordStatus(tenantId, "pinterest", "expired", r.message);
      }
    } catch (err) {
      logger.error("social.publish_failed", { tenantId, postId, platform: p, error: err });
      r = { ok: false, message: "Unexpected error while publishing." };
    }
    results[p] = r.ok ? { ok: true, id: r.data.id, url: r.data.url, at: now() } : { ok: false, error: r.message, at: now() };
  }

  const status = overallStatus(platforms, results);
  await admin.from("social_posts").update({ status, results: results as Json, ...(status === "published" ? { published_at: now() } : {}) }).eq("tenant_id", tenantId).eq("id", postId);
  await audit({ tenantId, actorUserId, actorType: actorUserId ? "user" : "system", action: status === "published" ? "social.post_published" : "social.post_failed", entityType: "social_post", entityId: postId, metadata: { platforms, ok: platforms.filter((p) => results[p]?.ok) } });
  return { status, results };
}
