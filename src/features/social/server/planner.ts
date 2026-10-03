import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { listIntegrationSummaries } from "@/features/integrations/server/store";
import { isAutoPlatform, type Channel, type ContentPillar, type PlatformResult, type PostStatus, type SocialPlatform } from "../compose";
import type { CalendarPost, Campaign, HashtagSet, MarketingDate, PlannerOverview } from "../planner-types";
import { builtInDatesBetween, istDayKey, istWeekRange, pillarMix } from "../planner";

/**
 * Planner queries. RLS server client (marketing.read), and every query is also filtered by the
 * tenant id the caller got from membership. Never pass a tenant id from the request.
 */

const POST_COLUMNS = "id, title, caption, hashtags, media_paths, link_url, platforms, status, scheduled_at, published_at, pillar, campaign_id, notes, manual_done, results, product_id" as const;

type PostRow = {
  id: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  media_paths: string[];
  link_url: string | null;
  platforms: string[];
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  pillar: string | null;
  campaign_id: string | null;
  notes: string | null;
  manual_done: string[];
  results: unknown;
  product_id: string | null;
};

function toPost(r: PostRow): CalendarPost {
  return {
    id: r.id,
    title: r.title,
    caption: r.caption,
    hashtags: r.hashtags,
    imagePath: r.media_paths[0] ?? null,
    linkUrl: r.link_url,
    channels: r.platforms as Channel[],
    status: r.status as PostStatus,
    at: r.scheduled_at ?? r.published_at,
    publishedAt: r.published_at,
    pillar: r.pillar as ContentPillar | null,
    campaignId: r.campaign_id,
    notes: r.notes,
    manualDone: r.manual_done as Channel[],
    results: (r.results ?? {}) as Partial<Record<SocialPlatform, PlatformResult>>,
    productId: r.product_id,
  };
}

const iso = (s: string) => {
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error("invalid date");
  return new Date(t).toISOString();
};

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
  const { data, error } = await (await createSupabaseServerClient()).from("social_campaigns").select("id, name, color, goal, starts_on, ends_on").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
  if (error) throw mapDbError(error);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, goal: c.goal, startsOn: c.starts_on, endsOn: c.ends_on }));
}

export async function listHashtagSets(tenantId: string): Promise<HashtagSet[]> {
  const { data, error } = await (await createSupabaseServerClient()).from("social_hashtag_sets").select("id, name, tags").eq("tenant_id", tenantId).order("name").limit(200);
  if (error) throw mapDbError(error);
  return (data ?? []).map((h) => ({ id: h.id, name: h.name, tags: h.tags }));
}

/** The store's own key dates (optionally within [fromDay, toDay]), oldest first. */
export async function listMarketingDates(tenantId: string, fromDay?: string, toDay?: string): Promise<MarketingDate[]> {
  let q = (await createSupabaseServerClient()).from("marketing_dates").select("id, title, on_date, kind, notes").eq("tenant_id", tenantId);
  if (fromDay) q = q.gte("on_date", fromDay);
  if (toDay) q = q.lte("on_date", toDay);
  const { data, error } = await q.order("on_date").limit(500);
  if (error) throw mapDbError(error);
  return (data ?? []).map((d) => ({ id: d.id, title: d.title, onDate: d.on_date, kind: d.kind as MarketingDate["kind"], notes: d.notes, builtIn: false }));
}

/** Calendar window [fromISO, toISO): dated posts (scheduled/planned time, else publish time), undated drafts, campaigns, key dates. */
export async function getCalendar(tenantId: string, fromISO: string, toISO: string): Promise<{ posts: CalendarPost[]; undated: CalendarPost[]; campaigns: Campaign[]; dates: MarketingDate[] }> {
  const from = iso(fromISO);
  const to = iso(toISO);
  const supabase = await createSupabaseServerClient();
  const fromDay = istDayKey(from);
  const toDay = istDayKey(new Date(Date.parse(to) - 1).toISOString());
  const [dated, undated, campaigns, own] = await Promise.all([
    supabase
      .from("social_posts")
      .select(POST_COLUMNS)
      .eq("tenant_id", tenantId)
      .or(`and(scheduled_at.gte.${from},scheduled_at.lt.${to}),and(scheduled_at.is.null,published_at.gte.${from},published_at.lt.${to})`)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase.from("social_posts").select(POST_COLUMNS).eq("tenant_id", tenantId).is("scheduled_at", null).in("status", ["draft", "failed"]).order("updated_at", { ascending: false }).limit(50),
    listCampaigns(tenantId),
    listMarketingDates(tenantId, fromDay, toDay),
  ]);
  if (dated.error) throw mapDbError(dated.error);
  if (undated.error) throw mapDbError(undated.error);
  const posts = (dated.data ?? []).map(toPost).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const dates = [...own, ...builtInDatesBetween(fromDay, toDay)].sort((a, b) => a.onDate.localeCompare(b.onDate));
  return { posts, undated: (undated.data ?? []).map(toPost), campaigns, dates };
}

export async function getPost(tenantId: string, id: string): Promise<CalendarPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await (await createSupabaseServerClient()).from("social_posts").select(POST_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  return data ? toPost(data) : null;
}

/** Newest first, up to 100. */
export async function listPosts(tenantId: string, f: { status?: PostStatus; channel?: Channel; campaignId?: string } = {}): Promise<CalendarPost[]> {
  let q = (await createSupabaseServerClient()).from("social_posts").select(POST_COLUMNS).eq("tenant_id", tenantId);
  if (f.status) q = q.eq("status", f.status);
  if (f.channel) q = q.contains("platforms", [f.channel]);
  if (f.campaignId && /^[0-9a-f-]{36}$/i.test(f.campaignId)) q = q.eq("campaign_id", f.campaignId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error) throw mapDbError(error);
  return (data ?? []).map(toPost);
}

export async function getPlannerOverview(tenantId: string): Promise<PlannerOverview> {
  const supabase = await createSupabaseServerClient();
  const week = istWeekRange();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const count = { count: "exact" as const, head: true };
  const [summaries, scheduled, planned, published, failed, overdue, mix] = await Promise.all([
    listIntegrationSummaries(tenantId, "social"),
    supabase.from("social_posts").select("id", count).eq("tenant_id", tenantId).eq("status", "scheduled").gte("scheduled_at", week.from).lt("scheduled_at", week.to),
    supabase.from("social_posts").select("id", count).eq("tenant_id", tenantId).eq("status", "planned").gte("scheduled_at", week.from).lt("scheduled_at", week.to),
    supabase.from("social_posts").select("id", count).eq("tenant_id", tenantId).eq("status", "published").gte("published_at", since30),
    supabase.from("social_posts").select("id", count).eq("tenant_id", tenantId).eq("status", "failed"),
    // Past-due posts that include planned (manual) channels; filtered below for channels not yet marked.
    supabase.from("social_posts").select("platforms, manual_done").eq("tenant_id", tenantId).in("status", ["planned", "scheduled", "published", "failed"]).lt("scheduled_at", now.toISOString()).gte("scheduled_at", since30).limit(500),
    supabase.from("social_posts").select("pillar").eq("tenant_id", tenantId).not("pillar", "is", null).gte("created_at", since30).limit(1000),
  ]);
  for (const r of [scheduled, planned, published, failed, overdue, mix]) if (r.error) throw mapDbError(r.error);
  return {
    connected: summaries.filter((s) => s.status === "connected").length,
    scheduledThisWeek: scheduled.count ?? 0,
    plannedThisWeek: planned.count ?? 0,
    published30d: published.count ?? 0,
    failed: failed.count ?? 0,
    overdueManual: (overdue.data ?? []).filter((p) => p.platforms.some((c) => !isAutoPlatform(c) && !p.manual_done.includes(c))).length,
    pillarMix: pillarMix(mix.data ?? []),
  };
}
