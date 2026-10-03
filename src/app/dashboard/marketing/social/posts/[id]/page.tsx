import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/layout";
import { assetUrl } from "@/lib/storage/assets";
import { formatDateTime, isoToIstLocal } from "@/features/analytics/dates";
import { getPost, listCampaigns, listHashtagSets } from "@/features/social/server/planner";
import { CHANNEL_LABELS, type PlatformResult, type SocialPlatform } from "@/features/social/compose";
import { PostComposer } from "@/features/social/components/composer";
import { PostActions } from "@/features/social/components/social-ui";
import { ChannelChip, STATUS_LABEL, STATUS_TONE } from "@/features/social/components/channels";
import { ManualPostPanel, isManualDue, manualChannels } from "@/features/social/components/manual-panel";
import { PlanNotice, loadSocialBase } from "../../_lib/data";

export const metadata: Metadata = { title: "Social post" };

const EDITABLE = new Set(["draft", "planned", "scheduled", "failed", "cancelled"]);

export default async function SocialPostPage({ params }: PageProps<"/dashboard/marketing/social/posts/[id]">) {
  const { id } = await params;
  const { ctx, enabled, write, connected } = await loadSocialBase();
  const post = await getPost(ctx.tenantId, id);
  if (!post) notFound();
  const editable = write && EDITABLE.has(post.status);
  const [campaigns, hashtagSets] = editable ? await Promise.all([listCampaigns(ctx.tenantId), listHashtagSets(ctx.tenantId)]) : [[], []];
  const img = assetUrl(post.imagePath);
  const results = Object.entries(post.results) as [SocialPlatform, PlatformResult][];

  return (
    <div className="space-y-4">
      <PlanNotice enabled={enabled} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/marketing/social/posts" className="text-small text-muted hover:text-foreground">← Posts</Link>
        <span className="text-muted" aria-hidden>·</span>
        <h2 className="min-w-0 truncate text-h3">{post.title || "Untitled post"}</h2>
        <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
        <span className="text-caption text-muted">{post.at ? formatDateTime(post.at) : "No date"}</span>
        <span className="flex gap-0.5">{post.channels.map((c) => <ChannelChip key={c} channel={c} done={post.manualDone.includes(c)} />)}</span>
      </div>

      {manualChannels(post).length && post.status !== "draft" && post.status !== "cancelled" ? (
        <div className={isManualDue(post) ? "" : "opacity-90"}>
          {!isManualDue(post) && post.at ? <p className="mb-2 text-caption text-muted">Planned channels are due {formatDateTime(post.at)}. You can prepare them now.</p> : null}
          <ManualPostPanel post={post} imageUrl={img} canWrite={write} />
        </div>
      ) : null}

      {results.length || write ? (
        <Card title="Publishing">
          {results.length ? (
            <ul className="space-y-1 text-small">
              {results.map(([net, r]) => (
                <li key={net} className={r.ok ? "text-success" : "text-error"}>
                  {CHANNEL_LABELS[net]}: {r.ok ? (r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">published</a> : "published") : r.error} <span className="text-caption text-muted">· {formatDateTime(r.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-muted">Not published to any network yet.</p>
          )}
          {write ? <PostActions id={post.id} status={post.status} /> : null}
        </Card>
      ) : null}

      {editable ? (
        <Card title="Edit post">
          <PostComposer
            connected={connected}
            campaigns={campaigns}
            hashtagSets={hashtagSets}
            value={{
              id: post.id,
              title: post.title ?? "",
              caption: post.caption,
              hashtags: post.hashtags.join(" "),
              mediaPath: post.imagePath ?? "",
              mediaUrl: img,
              linkUrl: post.linkUrl ?? "",
              platforms: post.channels,
              scheduledAt: post.at ? isoToIstLocal(post.at) : "",
              notes: post.notes ?? "",
              pillar: post.pillar ?? "",
              campaignId: post.campaignId ?? "",
            }}
          />
        </Card>
      ) : (
        <Card title="Post">
          <div className="flex flex-col gap-4 sm:flex-row">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="aspect-square w-full max-w-[200px] rounded-md border border-border object-cover" />
            ) : null}
            <div className="min-w-0 space-y-2 text-small">
              <p className="whitespace-pre-line">{post.caption || <span className="text-muted">No caption</span>}</p>
              {post.hashtags.length ? <p className="text-muted">{post.hashtags.join(" ")}</p> : null}
              {post.linkUrl ? <p className="break-all text-muted">{post.linkUrl}</p> : null}
              {post.notes ? <p className="rounded-md bg-surface-secondary p-2 text-caption">{post.notes}</p> : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
