import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Card } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { assetUrl } from "@/lib/storage/assets";
import { formatDateTime } from "@/features/analytics/dates";
import { listCampaigns, listPosts } from "@/features/social/server/planner";
import { ALL_CHANNELS, CHANNEL_LABELS, PILLAR_LABELS, type Channel, type PlatformResult, type PostStatus, type SocialPlatform } from "@/features/social/compose";
import { ChannelChip, STATUS_LABEL, STATUS_TONE } from "@/features/social/components/channels";
import { PostActions } from "@/features/social/components/social-ui";
import { isManualDue } from "@/features/social/components/manual-panel";
import { PlanNotice, loadSocialBase } from "../_lib/data";

export const metadata: Metadata = { title: "Social posts" };

const BASE = "/dashboard/marketing/social";
const STATUSES = Object.keys(STATUS_LABEL) as PostStatus[];

export default async function SocialPostsPage({ searchParams }: PageProps<"/dashboard/marketing/social/posts">) {
  const { ctx, enabled, write } = await loadSocialBase();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const channel = (ALL_CHANNELS as readonly string[]).includes(String(sp.channel)) ? (sp.channel as Channel) : undefined;
  const campaignId = typeof sp.campaign === "string" && sp.campaign ? sp.campaign : undefined;
  const [posts, campaigns] = await Promise.all([listPosts(ctx.tenantId, { status, channel, campaignId }), listCampaigns(ctx.tenantId)]);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const filtered = Boolean(status || channel || campaignId);

  return (
    <div className="space-y-4">
      <PlanNotice enabled={enabled} />
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3 shadow-xs" aria-label="Filter posts">
        <SelectField label="Status" name="status" defaultValue={status ?? ""} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} className="w-full sm:w-40" />
        <SelectField label="Channel" name="channel" defaultValue={channel ?? ""} options={[{ value: "", label: "All channels" }, ...ALL_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))]} className="w-full sm:w-40" />
        <SelectField label="Campaign" name="campaign" defaultValue={campaignId ?? ""} options={[{ value: "", label: "All campaigns" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} className="w-full sm:w-48" />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass({ variant: "secondary" })}>Apply</button>
          {filtered ? <Link href={`${BASE}/posts`} className={buttonClass({ variant: "ghost" })}>Clear</Link> : null}
        </div>
        {write ? (
          <Link href={`${BASE}/posts/new`} className={buttonClass({ className: "sm:ml-auto" })}>
            <Plus aria-hidden /> New post
          </Link>
        ) : null}
      </form>

      <Card title={`Posts${posts.length ? ` (${posts.length}${posts.length === 100 ? "+" : ""})` : ""}`}>
        {!posts.length ? (
          <EmptyState title={filtered ? "No posts match these filters" : "No posts yet"} description={filtered ? "Try another status, channel or campaign." : "Posts you draft, plan, schedule or publish appear here with their result on each network."} />
        ) : (
          <ul className="divide-y divide-border">
            {posts.map((p) => {
              const img = assetUrl(p.imagePath);
              const c = p.campaignId ? campaignById.get(p.campaignId) : undefined;
              return (
                <li key={p.id} className="flex gap-3 py-4 sm:gap-4">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="size-14 shrink-0 rounded-md border border-border object-cover sm:size-16" />
                  ) : (
                    <div className="size-14 shrink-0 rounded-md border border-dashed border-border sm:size-16" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      {isManualDue(p) ? <Badge tone="warning">Post now</Badge> : null}
                      <span className="text-caption text-muted">{p.at ? formatDateTime(p.at) : "No date"}</span>
                      <span className="flex gap-0.5">{p.channels.map((ch) => <ChannelChip key={ch} channel={ch} done={p.manualDone.includes(ch)} />)}</span>
                    </div>
                    <Link href={`${BASE}/posts/${p.id}`} className="block truncate font-medium hover:underline">{p.title || p.caption.split("\n")[0] || "Untitled post"}</Link>
                    {p.title && p.caption ? <p className="line-clamp-2 text-small text-muted">{p.caption}</p> : null}
                    {c || p.pillar ? (
                      <p className="flex flex-wrap gap-x-3 text-caption text-muted">
                        {c ? <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />{c.name}</span> : null}
                        {p.pillar ? <span>{PILLAR_LABELS[p.pillar]}</span> : null}
                      </p>
                    ) : null}
                    {Object.keys(p.results).length ? (
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
                        {(Object.entries(p.results) as [SocialPlatform, PlatformResult][]).map(([net, r]) => (
                          <li key={net} className={r.ok ? "text-success" : "text-error"}>
                            {CHANNEL_LABELS[net]}: {r.ok ? (r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">published</a> : "published") : r.error}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {write ? <PostActions id={p.id} status={p.status} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
