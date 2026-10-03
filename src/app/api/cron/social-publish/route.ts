import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/features/domains/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { claimPost, publishPost } from "@/features/social/server/publish";

/**
 * Cron (every 5 min): publishes scheduled social posts that are due. Each post is claimed with a
 * conditional status update (scheduled -> publishing) so overlapping runs never double-post.
 * Posts stuck in "publishing" for 30+ minutes (crashed run) are marked failed for the seller to retry.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  await admin
    .from("social_posts")
    .update({ status: "failed" })
    .eq("status", "publishing")
    .lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString());
  const { data: due, error } = await admin.from("social_posts").select("id, tenant_id").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(20);
  if (error) {
    logger.error("cron.social_publish_failed", { error: error.message });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  let published = 0;
  let failed = 0;
  for (const p of due ?? []) {
    if (!(await claimPost(p.tenant_id, p.id, ["scheduled"]))) continue;
    try {
      const r = await publishPost(p.tenant_id, p.id, null);
      if (r.status === "published") published++;
      else failed++;
    } catch (err) {
      failed++;
      logger.error("cron.social_publish_post_failed", { tenantId: p.tenant_id, postId: p.id, error: err });
      await admin.from("social_posts").update({ status: "failed" }).eq("tenant_id", p.tenant_id).eq("id", p.id);
    }
  }
  return NextResponse.json({ published, failed });
}
