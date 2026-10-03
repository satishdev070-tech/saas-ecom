import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Info, MessageCircle, XCircle } from "lucide-react";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { InlineAction } from "@/features/settings/ui/action-controls";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";
import { googleClient } from "@/features/google-business/server/api";
import { gbpView } from "@/features/google-business/server/connection";
import { loadConnectedLocation, loadLocationChoices, loadStoreProfile } from "@/features/google-business/server/profile";
import { listCachedReviews } from "@/features/google-business/server/reviews";
import { reviewLink, reviewStats, scoreCompleteness, v4LocationName, whatsappShareLink, type CheckState } from "@/features/google-business/gbp";
import { disconnectGbpAction, syncReviewsAction } from "@/features/google-business/actions";
import { CopyButton, DescriptionBuilder, LocationPicker, ReplyForm, Stars } from "@/features/google-business/components/gbp-client";

export const metadata: Metadata = { title: "Google Business Profile" };

const BASE = "/dashboard/marketing/google";
const ERRORS: Record<string, string> = {
  state: "The connection link expired or was opened in a different browser. Please try again.",
  denied: "The connection was cancelled.",
  plan: "Google Business Profile isn't available on your plan.",
  not_configured: "Google sign-in hasn't been set up by the platform yet.",
  no_refresh: "Google didn't grant offline access. Remove the app at myaccount.google.com/permissions and connect again.",
  api: "You signed in, but Google refused the Business Profile request. The platform's API access may still be awaiting Google's approval.",
  provider: "Google didn't accept the connection. Please try again and grant the requested permission.",
};
const STATUS_TONE = { connected: "success", error: "error", expired: "warning", not_connected: "neutral", disabled: "neutral" } as const;
const STATUS_LABEL = { connected: "Connected", error: "Error", expired: "Expired", not_connected: "Not connected", disabled: "Disabled" } as const;
const CHECK: Record<CheckState, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  ok: { icon: CheckCircle2, cls: "text-success", label: "Complete" },
  gap: { icon: XCircle, cls: "text-error", label: "Missing on Google" },
  mismatch: { icon: AlertTriangle, cls: "text-warning", label: "Doesn't match your store" },
  store_missing: { icon: CircleDashed, cls: "text-muted", label: "Add it to your store profile first" },
  pending: { icon: CircleDashed, cls: "text-muted", label: "Ready to add on Google" },
};
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function GoogleBusinessPage({ searchParams }: PageProps<"/dashboard/marketing/google">) {
  const ctx = await requireTenantPermission("marketing.read");
  const sp = await searchParams;
  const ratingParam = typeof sp.rating === "string" && /^[1-5]$/.test(sp.rating) ? Number(sp.rating) : null;
  const unrepliedOnly = sp.filter === "unreplied";

  const [ent, conn, client, store] = await Promise.all([getEntitlements(ctx.tenantId), gbpView(ctx.tenantId), googleClient(), loadStoreProfile(ctx.tenantId, ctx.tenantSlug)]);
  const enabled = ent.isEnabled("social_media");
  const write = can(ctx, "marketing.write") && enabled;
  const connected = conn?.status === "connected" && conn.enabled;
  const location = connected ? (conn.public.location_name ?? null) : null;
  const wantChoices = connected && write && (!location || sp.choose === "1");

  const [loc, choices, reviews] = await Promise.all([location ? loadConnectedLocation(ctx.tenantId) : null, wantChoices ? loadLocationChoices(ctx.tenantId) : null, listCachedReviews(ctx.tenantId, ratingParam)]);
  const listing = loc?.ok ? loc.data : null;
  const completeness = scoreCompleteness(store, listing);
  const stats = reviewStats(reviews.all);
  const rows = unrepliedOnly ? reviews.rows.filter((r) => !r.reply) : reviews.rows;
  const writeLink = reviewLink(listing?.placeId ?? conn?.public.place_id ?? null);
  const errorKey = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Google Business Profile" description="Connect your listing, answer Google reviews, publish posts and complete your profile." />

      {errorKey ? <p role="alert" className="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">{ERRORS[errorKey] ?? ERRORS.provider}</p> : null}
      {sp.connected === "1" ? <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">Google Business Profile connected.{sp.locations === "0" ? " No locations were found on this Google account: create or claim your profile below." : ""}</p> : null}
      {!enabled ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">Google Business Profile tools aren&apos;t included in your plan.</p> : null}
      <p className="flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-3 py-2 text-small text-info">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Google gives access to the Business Profile APIs only after it approves the platform&apos;s application. Until it does, you can connect, but Google may refuse to list reviews, accept replies or publish posts. Replies and posts work only on verified listings.</span>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Connection" actions={conn ? <Badge tone={STATUS_TONE[conn.status]}>{STATUS_LABEL[conn.status]}</Badge> : <Badge>Not connected</Badge>}>
          <div className="space-y-3 text-small">
            {conn ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">Account</dt>
                <dd>{conn.public.account_name ?? "Google account"}</dd>
                <dt className="text-muted">Location</dt>
                <dd>{conn.public.location_title ?? <span className="text-warning">Not chosen yet</span>}</dd>
                {conn.public.reviews_synced_at ? (
                  <>
                    <dt className="text-muted">Reviews synced</dt>
                    <dd>{dateFmt.format(Date.parse(conn.public.reviews_synced_at))}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="text-muted">Sign in with the Google account that manages your Business Profile. We ask only for the Business Profile permission (business.manage).</p>
            )}
            {conn && conn.status !== "connected" && conn.statusMessage ? <p className="text-caption text-error">{conn.statusMessage}</p> : null}
            {loc && !loc.ok ? <p className="text-caption text-error">{loc.message}</p> : null}
            {choices && !choices.ok ? <p className="text-caption text-error">{choices.message}</p> : null}
            {choices?.ok ? (
              choices.data.length ? (
                <LocationPicker choices={choices.data.flatMap((c) => { const v = v4LocationName(c.account, c.location); return v ? [{ value: v, label: c.address ? `${c.title} · ${c.address}` : c.title }] : []; })} current={location} />
              ) : (
                <p className="text-muted">This Google account has no Business Profile locations yet. Create or claim one, then come back.</p>
              )
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!client ? (
                <p className="text-caption text-muted">Google sign-in isn&apos;t configured by the platform yet.</p>
              ) : write ? (
                <a href="/api/oauth/google-business/start" className={buttonClass({ size: "sm", variant: conn ? "secondary" : "primary" })}>
                  {conn ? "Reconnect" : "Connect Google Business Profile"}
                </a>
              ) : null}
              {write && connected && location && sp.choose !== "1" ? (
                <Link href={`${BASE}?choose=1`} className={buttonClass({ size: "sm", variant: "ghost" })}>
                  Change location
                </Link>
              ) : null}
              {write && conn ? <InlineAction action={disconnectGbpAction} label="Disconnect" variant="ghost" /> : null}
            </div>
          </div>
        </Card>

        <Card title="Create or claim your profile" description="Creating and verifying a listing happens on Google: the API can't create a verified listing for you.">
          <ol className="list-decimal space-y-2 pl-5 text-small">
            <li>Open Google Business Profile and search for your shop name. If it already exists, claim it; otherwise add your business.</li>
            <li>Use the same name, address, phone and website as your store (see the checklist below).</li>
            <li>Verify the listing (Google may ask for a video, call, SMS or postcard).</li>
            <li>Come back here and connect it to manage reviews and posts.</li>
          </ol>
          <a href="https://business.google.com/create" target="_blank" rel="noopener noreferrer" className={`${buttonClass({ size: "sm", variant: "secondary" })} mt-4`}>
            Open business.google.com <ExternalLink aria-hidden />
          </a>
        </Card>
      </div>

      <Card title="Profile completeness" description={listing ? "Your store profile compared with your Google listing." : "What your listing needs. Connect a location to compare it with Google."} actions={listing ? <span className="text-h3 font-semibold">{completeness.score}%</span> : null}>
        {listing ? (
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-secondary" aria-hidden>
            <div className="h-full bg-success" style={{ width: `${completeness.score}%` }} />
          </div>
        ) : null}
        <ul className="divide-y divide-border">
          {completeness.items.map((i) => {
            const c = CHECK[i.state];
            const Icon = c.icon;
            return (
              <li key={i.key} className={`flex flex-wrap items-start gap-3 py-2.5 ${i.state === "gap" || i.state === "mismatch" ? "rounded-md bg-error/5 px-2" : ""}`}>
                <Icon className={`mt-0.5 size-4 shrink-0 ${c.cls}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium">
                    {i.label} <span className={`text-caption font-normal ${c.cls}`}>· {c.label}</span>
                  </p>
                  <p className="truncate text-caption text-muted">
                    Store: {i.store ?? "—"}
                    {listing ? ` · Google: ${i.google ?? "—"}` : ""}
                  </p>
                  {i.state !== "ok" ? <p className="text-caption text-muted">{i.tip}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
        {listing?.mapsUri ? (
          <a href={listing.mapsUri} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-small text-accent underline">
            View on Google Maps <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </Card>

      <Card title="Business description" description="A clear description helps you show up in local searches. Generate a draft, edit it, then copy it or save it to Google.">
        <DescriptionBuilder initial={listing?.description ?? ""} canWrite={write} canSave={write && Boolean(listing)} />
      </Card>

      <section aria-label="Google reviews" className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Average rating" value={conn?.public.review_average ? Number(conn.public.review_average).toFixed(1) : stats.average !== null ? stats.average.toFixed(1) : "—"} hint={<Stars n={stats.average !== null ? Math.round(stats.average) : null} />} />
          <StatCard label="Reviews" value={conn?.public.review_total ?? stats.count} hint="On Google" />
          <StatCard label="Unreplied" value={<span className={stats.unreplied ? "text-warning" : undefined}>{stats.unreplied}</span>} hint="Of synced reviews" />
          <StatCard label="5-star" value={stats.byStar[5]} hint={`${stats.byStar[1] + stats.byStar[2]} at 1–2 stars`} />
        </div>

        <Card title="Reviews" actions={write && connected && location ? <InlineAction action={syncReviewsAction} label="Sync reviews" success="Reviews synced." /> : null}>
          <nav aria-label="Filter reviews" className="mb-4 flex flex-wrap gap-2 text-small">
            {[
              { label: "All", href: BASE, active: !ratingParam && !unrepliedOnly },
              { label: "Unreplied", href: `${BASE}?filter=unreplied`, active: unrepliedOnly },
              ...[5, 4, 3, 2, 1].map((n) => ({ label: `${n}★`, href: `${BASE}?rating=${n}`, active: ratingParam === n })),
            ].map((f) => (
              <Link key={f.label} href={f.href} aria-current={f.active ? "true" : undefined} className={`rounded-full border px-3 py-1 ${f.active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground"}`}>
                {f.label}
              </Link>
            ))}
          </nav>
          {!rows.length ? (
            <EmptyState title={reviews.all.length ? "No reviews match this filter" : "No reviews yet"} description={connected && location ? "Sync to pull your latest Google reviews." : "Connect your Google Business Profile and choose a location to see reviews here."} />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.reviewer_name ?? "Google user"}</span>
                    <Stars n={r.star_rating} />
                    {r.review_time ? <span className="text-caption text-muted">{dateFmt.format(Date.parse(r.review_time))}</span> : null}
                    {!r.reply ? <Badge tone="warning">Needs reply</Badge> : null}
                  </div>
                  {r.comment ? <p className="whitespace-pre-line text-small">{r.comment}</p> : <p className="text-small text-muted">Rating only, no comment.</p>}
                  {r.reply ? (
                    <div className="rounded-md border-l-2 border-accent bg-surface-secondary px-3 py-2 text-small">
                      <p className="text-caption font-medium text-muted">Your reply{r.replied_at ? ` · ${dateFmt.format(Date.parse(r.replied_at))}` : ""}</p>
                      <p className="whitespace-pre-line">{r.reply}</p>
                    </div>
                  ) : null}
                  {write && connected ? <ReplyForm id={r.id} existing={r.reply} canSuggest={write} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card title="Request reviews" description="Send happy customers straight to the Google review form.">
        {writeLink ? (
          <div className="space-y-3">
            <p className="break-all rounded-md border border-border bg-surface-secondary px-3 py-2 font-mono text-caption">{writeLink}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={writeLink} label="Copy review link" />
              <a href={whatsappShareLink(store.name || ctx.tenantName, writeLink)} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm", variant: "secondary" })}>
                <MessageCircle aria-hidden /> Share on WhatsApp
              </a>
            </div>
            <p className="text-caption text-muted">Tip: add it to order confirmation messages. Don&apos;t offer discounts in exchange for reviews: Google&apos;s policy forbids incentivised reviews.</p>
          </div>
        ) : (
          <p className="text-small text-muted">Connect your profile and choose a location to get your review link (it uses your listing&apos;s Place ID).</p>
        )}
      </Card>
    </div>
  );
}
