import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { Badge, Card, StatCard } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { getCalendar, getPlannerOverview } from "@/features/social/server/planner";
import { CHANNEL_LABELS, CONTENT_PILLARS, PILLAR_LABELS, SOCIAL_PLATFORMS } from "@/features/social/compose";
import { ChannelChip, STATUS_LABEL, STATUS_TONE } from "@/features/social/components/channels";
import { isManualDue } from "@/features/social/components/manual-panel";
import { OAuthBanners, PlanNotice, loadSocialBase } from "./_lib/data";

export const metadata: Metadata = { title: "Social" };

const BASE = "/dashboard/marketing/social";
const PILLAR_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#0ea5e9", "#ec4899", "#f97316", "#8b5cf6"];
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function SocialOverviewPage({ searchParams }: PageProps<"/dashboard/marketing/social">) {
  const { ctx, summaries, enabled, write, connected } = await loadSocialBase();
  const sp = await searchParams;
  const now = new Date();
  const [overview, week] = await Promise.all([getPlannerOverview(ctx.tenantId), getCalendar(ctx.tenantId, now.toISOString(), new Date(now.getTime() + 7 * 86_400_000).toISOString())]);
  const campaignById = new Map(week.campaigns.map((c) => [c.id, c]));
  const agenda = week.posts.filter((p) => p.status !== "cancelled");
  const groups = new Map<string, typeof agenda>();
  for (const p of agenda) {
    const k = dayFmt.format(Date.parse(p.at!));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const mix = CONTENT_PILLARS.map((p, i) => ({ key: p, label: PILLAR_LABELS[p], n: overview.pillarMix[p] ?? 0, color: PILLAR_COLORS[i]! })).filter((x) => x.n > 0);
  const mixTotal = mix.reduce((s, x) => s + x.n, 0);

  return (
    <div className="space-y-6">
      <OAuthBanners sp={sp} />
      <PlanNotice enabled={enabled} />

      {overview.failed || overview.overdueManual ? (
        <div className="space-y-2">
          {overview.failed ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">
              <AlertTriangle className="size-4" aria-hidden />
              {overview.failed === 1 ? "1 post failed to publish." : `${overview.failed} posts failed to publish.`}
              <Link href={`${BASE}/posts?status=failed`} className="font-medium underline">Review and retry</Link>
            </p>
          ) : null}
          {overview.overdueManual ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">
              <AlertTriangle className="size-4" aria-hidden />
              {overview.overdueManual === 1 ? "1 planned post is past its time and not marked posted." : `${overview.overdueManual} planned posts are past their time and not marked posted.`}
              <Link href={`${BASE}/posts?status=planned`} className="font-medium underline">Post them now</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Connected networks" value={overview.connected} />
        <StatCard label="Scheduled this week" value={overview.scheduledThisWeek} hint="Auto-publish" />
        <StatCard label="Planned this week" value={overview.plannedThisWeek} hint="Manual reminders" />
        <StatCard label="Published (30 days)" value={overview.published30d} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Failed" value={<span className={overview.failed ? "text-error" : undefined}>{overview.failed}</span>} hint={overview.overdueManual ? `${overview.overdueManual} manual overdue` : "Nothing overdue"} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title="Next 7 days"
          actions={
            write ? (
              <Link href={`${BASE}/posts/new`} className={buttonClass({ size: "sm" })}>
                <Plus aria-hidden /> New post
              </Link>
            ) : null
          }
        >
          {!agenda.length && !week.dates.length ? (
            <EmptyState title="Nothing planned this week" description="Plan a post for a date, or schedule one to publish automatically." action={<Link href={`${BASE}/calendar`} className={buttonClass({ variant: "secondary", size: "sm" })}>Open calendar</Link>} />
          ) : (
            <div className="space-y-4">
              {week.dates.length ? (
                <ul aria-label="Key dates" className="flex flex-wrap gap-2">
                  {week.dates.map((d) => (
                    <li key={`${d.onDate}-${d.title}`}><Badge tone={d.kind === "sale" ? "error" : d.kind === "festival" ? "warning" : d.kind === "launch" ? "info" : "neutral"}>{d.title} · {dayFmt.format(Date.parse(`${d.onDate}T12:00:00+05:30`))}</Badge></li>
                  ))}
                </ul>
              ) : null}
              {[...groups].map(([day, list]) => (
                <div key={day}>
                  <h3 className="mb-1.5 text-caption font-medium text-muted">{day}</h3>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {list.map((p) => {
                      const c = p.campaignId ? campaignById.get(p.campaignId) : undefined;
                      return (
                        <li key={p.id}>
                          <Link href={`${BASE}/posts/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
                            <span className="w-16 shrink-0 text-small text-muted tabular-nums">{timeFmt.format(Date.parse(p.at!))}</span>
                            {c ? <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} title={c.name} aria-hidden /> : null}
                            <span className="min-w-0 flex-1 truncate text-small font-medium">{p.title || p.caption.split("\n")[0] || "Untitled post"}</span>
                            <span className="flex gap-0.5">{p.channels.map((ch) => <ChannelChip key={ch} channel={ch} done={p.manualDone.includes(ch)} />)}</span>
                            {isManualDue(p) ? <Badge tone="warning">Post now</Badge> : <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <Link href={`${BASE}/calendar`} className="inline-block text-small font-medium text-accent underline-offset-2 hover:underline">Open calendar</Link>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Content mix" description="Posts by pillar, last 30 days and upcoming">
            {mixTotal ? (
              <div className="space-y-3">
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-secondary" role="img" aria-label={mix.map((x) => `${x.label} ${Math.round((x.n / mixTotal) * 100)}%`).join(", ")}>
                  {mix.map((x) => <span key={x.key} style={{ width: `${(x.n / mixTotal) * 100}%`, backgroundColor: x.color }} />)}
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-caption">
                  {mix.map((x) => (
                    <li key={x.key} className="flex items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} aria-hidden />
                      <span className="truncate">{x.label}</span>
                      <span className="ml-auto text-muted tabular-nums">{x.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-small text-muted">Tag posts with a content pillar to see your mix. A healthy plan blends product, offers, how-tos and customer stories.</p>
            )}
          </Card>

          <Card title="Accounts" actions={<Link href={`${BASE}/accounts`} className="text-small font-medium text-accent hover:underline">Manage</Link>}>
            <ul className="space-y-2 text-small">
              {SOCIAL_PLATFORMS.map((p) => {
                const s = summaries.find((x) => x.provider === p);
                const ok = connected.includes(p);
                return (
                  <li key={p} className="flex items-center gap-2">
                    <ChannelChip channel={p} />
                    <span className="min-w-0 flex-1 truncate">
                      {CHANNEL_LABELS[p]}
                      {s?.public.account_name ? <span className="text-muted"> · {s.public.account_name}</span> : null}
                    </span>
                    <Badge tone={ok ? "success" : s?.status === "error" || s?.status === "expired" ? "warning" : "neutral"}>{ok ? "Connected" : s?.status === "expired" ? "Expired" : s?.status === "error" ? "Error" : "Not connected"}</Badge>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption text-muted">WhatsApp, X, LinkedIn, Threads and YouTube are planned channels: we remind you, you post.</p>
            {overview.connected === 0 && write ? <Link href={`${BASE}/accounts`} className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}>Connect an account</Link> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
