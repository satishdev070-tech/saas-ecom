import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonClass } from "@/components/ui/button";
import { InlineAction } from "@/features/settings/ui/action-controls";
import { cn } from "@/lib/cn";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { getEntitlements } from "@/features/platform";
import { listIntegrationSummaries } from "@/features/integrations/server/store";
import { ChannelChip } from "@/features/social/components/channels";
import { getThread, listConversations, unreadByChannel, type InboxFilters } from "@/features/inbox/server/queries";
import { whatsappSummary } from "@/features/inbox/server/whatsapp";
import { CHANNEL_NAME, INBOX_CHANNELS, serviceWindow, windowClosedMessage, windowLabel } from "@/features/inbox/window";
import { AutoRefresh, MarkRead, ReplyBox, ScrollToEnd } from "@/features/inbox/components/inbox-client";
import { ChannelSettings } from "@/features/inbox/components/channel-settings";
import { setConversationStatusAction } from "@/features/inbox/actions";

export const metadata: Metadata = { title: "Inbox" };

const BASE = "/dashboard/marketing/inbox";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fmtTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const sameDay = day(new Date()) === day(d);
  return new Intl.DateTimeFormat("en-IN", sameDay ? { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" } : { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
};
const fmtFull = (iso: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default async function InboxPage({ searchParams }: PageProps<"/dashboard/marketing/inbox">) {
  const ctx = await requireTenantPermission("marketing.read");
  const sp = await searchParams;
  const channelParam = one(sp.channel);
  const statusParam = one(sp.status);
  const filters: InboxFilters = {
    channel: INBOX_CHANNELS.find((c) => c === channelParam),
    status: statusParam === "closed" || statusParam === "all" ? statusParam : "open",
    unread: one(sp.unread) === "1",
    q: one(sp.q)?.slice(0, 80),
  };
  const selectedId = one(sp.c);
  const showSettings = one(sp.settings) === "1";

  const [ent, conversations, unread, thread, summaries, wa] = await Promise.all([
    getEntitlements(ctx.tenantId),
    listConversations(ctx.tenantId, filters),
    unreadByChannel(ctx.tenantId),
    selectedId && UUID.test(selectedId) ? getThread(ctx.tenantId, selectedId) : Promise.resolve(null),
    listIntegrationSummaries(ctx.tenantId, "social"),
    whatsappSummary(ctx.tenantId),
  ]);
  const enabled = ent.isEnabled("social_media");
  const write = can(ctx, "marketing.write") && enabled;
  const fb = summaries.find((s) => s.provider === "facebook");
  const ig = summaries.find((s) => s.provider === "instagram");
  const anyChannel = fb?.status === "connected" || ig?.status === "connected" || wa.status === "connected";

  const href = (patch: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { channel: filters.channel, status: filters.status === "open" ? undefined : filters.status, unread: filters.unread ? "1" : undefined, q: filters.q, c: selectedId, settings: showSettings ? "1" : undefined };
    const q = new URLSearchParams(Object.entries({ ...base, ...patch }).filter((e): e is [string, string] => Boolean(e[1])));
    const s = q.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const totalUnread = unread.facebook + unread.instagram + unread.whatsapp;
  const conv = thread?.conversation;
  const win = conv ? serviceWindow(conv.lastInboundAt) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Messenger, Instagram and WhatsApp messages from your customers in one place."
        actions={
          <Link href={href({ settings: showSettings ? undefined : "1" })} className={buttonClass({ variant: "secondary", size: "sm" })} aria-expanded={showSettings}>
            {showSettings ? "Hide channels" : "Channels"}
          </Link>
        }
      />
      <AutoRefresh seconds={20} />
      {!enabled ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">The inbox is part of social media, which isn&apos;t included in your plan.</p> : null}
      {showSettings || (!anyChannel && !conversations.length) ? (
        <ChannelSettings
          canManage={write}
          meta={{ facebook: { status: fb?.status ?? "not_connected", account: fb?.public.account_name ?? null }, instagram: { status: ig?.status ?? "not_connected", account: ig?.public.account_name ?? null } }}
          whatsapp={wa}
        />
      ) : null}

      <div className="grid min-h-[480px] gap-4 md:h-[calc(100dvh-13rem)] md:grid-cols-[minmax(260px,340px)_1fr]">
        {/* Conversation list */}
        <aside className={cn("min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface", conv ? "hidden md:flex" : "flex")} aria-label="Conversations">
          <div className="space-y-2 border-b border-border p-3">
            <nav aria-label="Channel filter" className="-mx-1 flex gap-1 overflow-x-auto px-1">
              {[undefined, ...INBOX_CHANNELS].map((c) => {
                const active = filters.channel === c;
                const n = c ? unread[c] : totalUnread;
                return (
                  <Link key={c ?? "all"} href={href({ channel: c, c: undefined })} aria-current={active ? "true" : undefined} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-medium", active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground")}>
                    {c ? <ChannelChip channel={c} /> : null}
                    {c ? CHANNEL_NAME[c] : "All"}
                    {n ? <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 text-white">{n}</span> : null}
                  </Link>
                );
              })}
            </nav>
            <div className="flex flex-wrap items-center gap-2 text-caption">
              {(["open", "closed", "all"] as const).map((s) => (
                <Link key={s} href={href({ status: s === "open" ? undefined : s, c: undefined })} aria-current={filters.status === s ? "true" : undefined} className={cn("rounded px-2 py-1", filters.status === s ? "bg-surface-secondary font-medium text-foreground" : "text-muted hover:text-foreground")}>
                  {s === "open" ? "Open" : s === "closed" ? "Closed" : "All"}
                </Link>
              ))}
              <Link href={href({ unread: filters.unread ? undefined : "1", c: undefined })} aria-pressed={filters.unread} className={cn("ml-auto rounded px-2 py-1", filters.unread ? "bg-surface-secondary font-medium text-foreground" : "text-muted hover:text-foreground")}>
                Unread only
              </Link>
            </div>
            <form action={BASE} className="flex gap-2" role="search">
              {filters.channel ? <input type="hidden" name="channel" value={filters.channel} /> : null}
              {filters.status !== "open" ? <input type="hidden" name="status" value={filters.status} /> : null}
              {filters.unread ? <input type="hidden" name="unread" value="1" /> : null}
              <label htmlFor="inbox-q" className="sr-only">
                Search conversations
              </label>
              <input id="inbox-q" name="q" defaultValue={filters.q ?? ""} placeholder="Search name or message" maxLength={80} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-small" />
            </form>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {conversations.length ? (
              conversations.map((c) => (
                <li key={c.id}>
                  <Link href={href({ c: c.id })} aria-current={c.id === conv?.id ? "page" : undefined} className={cn("flex gap-3 px-3 py-3 hover:bg-surface-secondary/60", c.id === conv?.id && "bg-surface-secondary")}>
                    <ChannelChip channel={c.channel} className="mt-0.5 h-5 min-w-5 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-small", c.unread ? "font-semibold" : "font-medium")}>{c.participantName ?? `${CHANNEL_NAME[c.channel]} user …${c.participantId.slice(-4)}`}</span>
                        <span className="shrink-0 text-caption text-muted">{fmtTime(c.lastMessageAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-caption", c.unread ? "text-foreground" : "text-muted")}>{c.lastPreview ?? ""}</span>
                        {c.unread ? <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] leading-4 text-white" aria-label={`${c.unread} unread`}>{c.unread}</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))
            ) : (
              <li className="p-4">
                <EmptyState title="No conversations" description={anyChannel ? "New messages appear here automatically." : "Connect a channel to start receiving messages."} />
              </li>
            )}
          </ul>
        </aside>

        {/* Thread */}
        <section className={cn("min-h-[480px] flex-col overflow-hidden rounded-lg border border-border bg-surface md:min-h-0", conv ? "flex" : "hidden md:flex")} aria-label="Conversation">
          {conv && thread && win ? (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <Link href={href({ c: undefined })} className="text-small text-accent md:hidden" aria-label="Back to conversations">
                  ← Back
                </Link>
                <ChannelChip channel={conv.channel} className="h-5 min-w-5 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{conv.participantName ?? `${CHANNEL_NAME[conv.channel]} user …${conv.participantId.slice(-4)}`}</h2>
                  <p className="text-caption text-muted">
                    {CHANNEL_NAME[conv.channel]}
                    {conv.channel === "whatsapp" ? ` · +${conv.participantId}` : ""}
                  </p>
                </div>
                <span title={win.closesAt ? `Free-form replies allowed until ${fmtFull(win.closesAt)}` : "The customer hasn't messaged yet"}>
                  <Badge tone={win.open ? (win.remainingMs < 3 * 3600_000 ? "warning" : "success") : "neutral"}>24h window: {windowLabel(win)}</Badge>
                </span>
                {conv.status === "closed" ? <Badge tone="neutral">Closed</Badge> : null}
                {write ? <InlineAction action={setConversationStatusAction} fields={{ conversationId: conv.id, status: conv.status === "open" ? "closed" : "open" }} label={conv.status === "open" ? "Close" : "Reopen"} /> : null}
              </header>
              <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-secondary/30 p-3" aria-live="polite">
                {thread.messages.map((m) => (
                  <li key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-small sm:max-w-[70%]", m.direction === "out" ? "bg-accent text-white" : "border border-border bg-surface")}>
                      {m.body ? <p className="break-words whitespace-pre-wrap">{m.body}</p> : null}
                      {m.mediaUrl ? (
                        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                          Open attachment
                        </a>
                      ) : null}
                      <p className={cn("mt-1 text-[11px]", m.direction === "out" ? "text-white/80" : "text-muted")}>
                        {fmtFull(m.sentAt)}
                        {m.direction === "out" ? ` · ${m.status === "sending" ? "Sending" : m.status === "failed" ? "Failed" : "Sent"}` : ""}
                      </p>
                      {m.status === "failed" && m.error ? <p className="mt-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-error">{m.error}</p> : null}
                    </div>
                  </li>
                ))}
                <ScrollToEnd dep={`${conv.id}:${thread.messages.length}`} />
              </ol>
              <div className="border-t border-border p-3">
                {write ? (
                  <>
                    <MarkRead conversationId={conv.id} unread={conv.unread} />
                    <ReplyBox conversationId={conv.id} windowOpen={win.open} closedMessage={windowClosedMessage(conv.channel)} canSuggest />
                  </>
                ) : (
                  <p className="text-small text-muted">You can read this conversation. Replying needs marketing write access{enabled ? "" : " and the social media plan feature"}.</p>
                )}
              </div>
            </>
          ) : (
            <div className="m-auto p-6">
              <EmptyState title={selectedId ? "Conversation not found" : "Select a conversation"} description="Replies go out through the same channel the customer used." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
