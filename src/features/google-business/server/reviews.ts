import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { listReviews, putReply, type Result } from "./api";
import { gbpAccess, recordGbpStatus, updateGbpPublic } from "./connection";

/**
 * gbp_reviews cache. Reads go through RLS (marketing.read). Writes use the secret-key client and
 * are only reached after the caller's permission check (server action) or from the CRON_SECRET
 * cron, always with a tenant id resolved server-side.
 */

export type ReviewRow = { id: string; review_id: string; location_name: string; reviewer_name: string | null; star_rating: number | null; comment: string | null; reply: string | null; replied_at: string | null; review_time: string | null };

export async function syncReviews(tenantId: string): Promise<Result<{ synced: number }>> {
  const access = await gbpAccess(tenantId);
  if (!access.ok) return access;
  const location = access.data.location;
  if (!location) return { ok: false, message: "Choose your Google Business location first." };
  const r = await listReviews(access.data.token, location);
  if (!r.ok) {
    if (r.expired) await recordGbpStatus(tenantId, "expired", r.message);
    return r;
  }
  const now = new Date().toISOString();
  const rows = r.data.reviews.map((x) => ({
    tenant_id: tenantId,
    location_name: location,
    review_id: x.reviewId,
    reviewer_name: x.reviewerName,
    star_rating: x.starRating,
    comment: x.comment,
    reply: x.reply,
    replied_at: x.repliedAt,
    review_time: x.reviewTime,
    synced_at: now,
  }));
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("gbp_reviews").upsert(rows.slice(i, i + 200), { onConflict: "tenant_id,review_id" });
    if (error) {
      logger.error("gbp.reviews_upsert_failed", { tenantId, code: error.code });
      return { ok: false, message: "Couldn't save the reviews. Try again." };
    }
  }
  // Reviews of a previously selected location don't belong in the list any more.
  await admin.from("gbp_reviews").delete().eq("tenant_id", tenantId).neq("location_name", location);
  await updateGbpPublic(tenantId, null, {
    reviews_synced_at: now,
    review_average: r.data.average !== null ? String(r.data.average) : null,
    review_total: r.data.total !== null ? String(r.data.total) : null,
  });
  return { ok: true, data: { synced: rows.length } };
}

/** RLS-scoped list for the dashboard (newest first, optional star filter). */
export async function listCachedReviews(tenantId: string, rating: number | null): Promise<{ rows: ReviewRow[]; all: { star_rating: number | null; reply: string | null }[] }> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("gbp_reviews").select("id, review_id, location_name, reviewer_name, star_rating, comment, reply, replied_at, review_time").eq("tenant_id", tenantId).order("review_time", { ascending: false, nullsFirst: false }).limit(200);
  if (rating) q = q.eq("star_rating", rating);
  const [{ data }, { data: all }] = await Promise.all([q, supabase.from("gbp_reviews").select("star_rating, reply").eq("tenant_id", tenantId).limit(5000)]);
  return { rows: data ?? [], all: all ?? [] };
}

/** Posts the reply to Google (create or edit), then mirrors it in the cache. Caller checked marketing.write. */
export async function replyToReview(tenantId: string, reviewRowId: string, comment: string): Promise<Result<null>> {
  // RLS read: the row must belong to the caller's store.
  const { data: row } = await (await createSupabaseServerClient()).from("gbp_reviews").select("id, review_id, location_name").eq("tenant_id", tenantId).eq("id", reviewRowId).maybeSingle();
  if (!row) return { ok: false, message: "That review wasn't found. Sync reviews and try again." };
  const access = await gbpAccess(tenantId);
  if (!access.ok) return access;
  if (access.data.location !== row.location_name) return { ok: false, message: "This review belongs to a different location. Sync reviews and try again." };
  const r = await putReply(access.data.token, row.location_name, row.review_id, comment);
  if (!r.ok) {
    if (r.expired) await recordGbpStatus(tenantId, "expired", r.message);
    return r;
  }
  const { error } = await createSupabaseAdminClient()
    .from("gbp_reviews")
    .update({ reply: comment, replied_at: r.data.updateTime ? new Date(r.data.updateTime).toISOString() : new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", row.id);
  if (error) logger.warn("gbp.reply_cache_failed", { tenantId, code: error.code });
  return { ok: true, data: null };
}

export async function getReviewForSuggest(tenantId: string, reviewRowId: string) {
  const { data } = await (await createSupabaseServerClient()).from("gbp_reviews").select("reviewer_name, star_rating, comment").eq("tenant_id", tenantId).eq("id", reviewRowId).maybeSingle();
  return data;
}

/** Cron: sync every connected store with a chosen location (oldest sync first, bounded). */
export async function syncAllReviews(limit = 25): Promise<{ synced: number; failed: number }> {
  const { data } = await createSupabaseAdminClient().from("tenant_integrations").select("tenant_id, public_config").eq("provider", "google_business").eq("status", "connected").eq("enabled", true).limit(500);
  const due = (data ?? [])
    .map((r) => ({ tenantId: r.tenant_id, cfg: (r.public_config ?? {}) as Record<string, unknown> }))
    .filter((r) => typeof r.cfg.location_name === "string")
    .sort((a, b) => String(a.cfg.reviews_synced_at ?? "").localeCompare(String(b.cfg.reviews_synced_at ?? "")))
    .slice(0, limit);
  let synced = 0;
  let failed = 0;
  for (const t of due) {
    try {
      const r = await syncReviews(t.tenantId);
      if (r.ok) synced++;
      else failed++;
    } catch (err) {
      failed++;
      logger.error("gbp.cron_sync_failed", { tenantId: t.tenantId, error: err });
    }
  }
  return { synced, failed };
}
