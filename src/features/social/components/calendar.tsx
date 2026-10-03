"use client";

import { useId, useOptimistic, useRef, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { inputClassName } from "@/components/ui/field";
import { assetUrl } from "@/lib/storage/assets";
import { cn } from "@/lib/cn";
import { formatDateTime, isoToIstLocal } from "@/features/analytics/dates";
import { reschedulePostAction } from "../planner-actions";
import type { Campaign, CalendarPost, MarketingDate } from "../planner-types";
import { ChannelChip, STATUS_LABEL, STATUS_TONE } from "./channels";
import { ManualPostPanel, isManualDue } from "./manual-panel";

const BASE = "/dashboard/marketing/social";
const MOVABLE = new Set(["draft", "planned", "scheduled"]);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const fmtKey = (k: string, f = dayLabel) => f.format(Date.parse(`${k}T00:00:00Z`));
const keyOf = (iso: string) => isoToIstLocal(iso).slice(0, 10);
const timeOf = (iso: string | null) => (iso ? isoToIstLocal(iso).slice(11, 16) : "09:00");
const DATE_TONE: Record<MarketingDate["kind"], string> = { sale: "text-error", launch: "text-info", festival: "text-warning", other: "text-muted" };

type Move = { id: string; at: string | null };

export type CalendarProps = {
  view: "month" | "week";
  title: string;
  days: string[];
  /** Month view: "YYYY-MM" of the shown month (other days are dimmed). */
  month: string | null;
  today: string;
  nav: { prev: string; next: string; today: string; month: string; week: string };
  posts: CalendarPost[];
  undated: CalendarPost[];
  campaigns: Campaign[];
  dates: MarketingDate[];
  canWrite: boolean;
};

export function PlannerCalendar(props: CalendarProps) {
  const { view, days, month, today, nav, campaigns, dates, canWrite } = props;
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [all, applyMove] = useOptimistic([...props.posts, ...props.undated], (cur: CalendarPost[], m: Move) => cur.map((p) => (p.id === m.id ? { ...p, at: m.at } : p)));
  const [open, setOpen] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const byDay = new Map<string, CalendarPost[]>();
  for (const p of all) if (p.at) byDay.set(keyOf(p.at), [...(byDay.get(keyOf(p.at)) ?? []), p]);
  for (const list of byDay.values()) list.sort((a, b) => (a.at! < b.at! ? -1 : 1));
  const datesByDay = new Map<string, MarketingDate[]>();
  for (const d of dates) datesByDay.set(d.onDate, [...(datesByDay.get(d.onDate) ?? []), d]);
  const undated = all.filter((p) => !p.at);
  const openPost = all.find((p) => p.id === open) ?? null;

  const move = (id: string, day: string) => {
    const post = all.find((p) => p.id === id);
    if (!post || !MOVABLE.has(post.status)) return;
    const local = `${day}T${timeOf(post.at)}`;
    if (post.at && isoToIstLocal(post.at) === local) return;
    setError(null);
    startTransition(async () => {
      applyMove({ id, at: new Date(Date.parse(`${local}:00+05:30`)).toISOString() });
      try {
        const r = await reschedulePostAction(id, local);
        if (!r.ok) setError(r.error.fieldErrors?._form?.[0] ?? Object.values(r.error.fieldErrors ?? {})[0]?.[0] ?? r.error.message);
      } catch {
        setError("Couldn't move the post. Please try again.");
      }
    });
  };
  const showPost = (id: string) => {
    setOpen(id);
    dialogRef.current?.showModal();
  };
  const onDrop = (e: DragEvent, day: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/x-post-id");
    if (id) move(id, day);
  };
  const dropProps = (day: string) =>
    canWrite
      ? {
          onDragOver: (e: DragEvent) => {
            if (e.dataTransfer.types.includes("text/x-post-id")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== day) setDragOver(day);
            }
          },
          onDragLeave: () => setDragOver((d) => (d === day ? null : d)),
          onDrop: (e: DragEvent) => onDrop(e, day),
        }
      : {};
  const chip = (p: CalendarPost, compact = false) => (
    <PostChip key={p.id} post={p} campaign={p.campaignId ? campaignById.get(p.campaignId) : undefined} draggable={canWrite && MOVABLE.has(p.status)} onOpen={() => showPost(p.id)} compact={compact} />
  );
  const addHref = (day: string) => `${BASE}/posts/new?at=${day}T09:00`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={nav.prev} className={buttonClass({ variant: "secondary", size: "sm", className: "px-2" })} aria-label={view === "month" ? "Previous month" : "Previous week"}>
            <ChevronLeft aria-hidden />
          </Link>
          <Link href={nav.today} className={buttonClass({ variant: "secondary", size: "sm" })}>Today</Link>
          <Link href={nav.next} className={buttonClass({ variant: "secondary", size: "sm", className: "px-2" })} aria-label={view === "month" ? "Next month" : "Next week"}>
            <ChevronRight aria-hidden />
          </Link>
        </div>
        <h2 className="text-h3" aria-live="polite">{props.title}</h2>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-md border border-border p-0.5">
            {(["month", "week"] as const).map((v) => (
              <Link key={v} href={nav[v]} aria-current={view === v ? "page" : undefined} className={cn("rounded px-2.5 py-1 text-small capitalize", view === v ? "bg-surface-secondary font-medium" : "text-muted hover:text-foreground")}>
                {v}
              </Link>
            ))}
          </div>
          {canWrite ? (
            <Link href={`${BASE}/posts/new`} className={buttonClass({ size: "sm" })}>
              <Plus aria-hidden /> New post
            </Link>
          ) : null}
        </div>
      </div>
      {error ? <p role="alert" className="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">{error} The post was moved back.</p> : null}
      {campaigns.length ? (
        <ul aria-label="Campaigns" className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
          {campaigns.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />{c.name}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_240px]">
        {/* Desktop/tablet grid */}
        <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-xs md:block">
          <div className="grid grid-cols-7 border-b border-border bg-surface-secondary/60 text-caption font-medium text-muted" aria-hidden>
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
          </div>
          <ul className="grid grid-cols-7" aria-label={`Calendar, ${props.title}`}>
            {days.map((day, i) => {
              const list = byDay.get(day) ?? [];
              const ds = datesByDay.get(day) ?? [];
              const outside = month !== null && !day.startsWith(month);
              return (
                <li
                  key={day}
                  {...dropProps(day)}
                  className={cn(
                    "group relative flex flex-col gap-1 border-border p-1.5",
                    view === "month" ? "min-h-28" : "min-h-80",
                    i % 7 !== 6 && "border-r",
                    i < days.length - 7 && "border-b",
                    outside && "bg-surface-secondary/40",
                    dragOver === day && "bg-accent-soft ring-2 ring-accent ring-inset",
                  )}
                >
                  {canWrite ? (
                    <Link href={addHref(day)} className="absolute inset-0 z-0 rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`Add post on ${fmtKey(day, dayLong)}`} />
                  ) : null}
                  <div className="pointer-events-none relative z-10 flex items-start justify-between gap-1">
                    <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-caption tabular-nums", day === today ? "bg-accent font-semibold text-accent-foreground" : outside ? "text-subtle" : "text-muted")}>
                      {Number(day.slice(8))}
                    </span>
                    {canWrite ? <Plus className="size-3.5 text-muted opacity-0 group-hover:opacity-100" aria-hidden /> : null}
                  </div>
                  {ds.map((d) => (
                    <p key={`${d.title}-${d.id}`} title={d.notes ?? d.title} className={cn("pointer-events-none relative z-10 truncate text-[11px] leading-tight font-medium", DATE_TONE[d.kind])}>
                      {d.title}
                    </p>
                  ))}
                  <div className="relative z-10 flex flex-col gap-1">{list.map((p) => chip(p))}</div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Mobile agenda */}
        <ol className="space-y-3 md:hidden" aria-label={`Agenda, ${props.title}`}>
          {days
            .filter((d) => (month === null || d.startsWith(month)) && ((byDay.get(d)?.length ?? 0) > 0 || (datesByDay.get(d)?.length ?? 0) > 0 || d === today))
            .map((day) => (
              <li key={day} className="rounded-lg border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className={cn("text-small font-semibold", day === today && "text-accent")}>{fmtKey(day, dayLong)}{day === today ? " · Today" : ""}</h3>
                  {canWrite ? (
                    <Link href={addHref(day)} className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })} aria-label={`Add post on ${fmtKey(day, dayLong)}`}>
                      <Plus aria-hidden />
                    </Link>
                  ) : null}
                </div>
                {(datesByDay.get(day) ?? []).map((d) => <p key={`${d.title}-${d.id}`} className={cn("text-caption font-medium", DATE_TONE[d.kind])}>{d.title}</p>)}
                <div className="mt-1 flex flex-col gap-1.5">{(byDay.get(day) ?? []).map((p) => chip(p))}</div>
                {!(byDay.get(day)?.length) ? <p className="text-caption text-muted">Nothing planned.</p> : null}
              </li>
            ))}
        </ol>

        <aside aria-label="Undated drafts" className="space-y-2 rounded-lg border border-dashed border-border p-3 2xl:self-start">
          <h3 className="text-label">Undated drafts</h3>
          <p className="text-caption text-muted">{canWrite ? "Drag a draft onto a day, or open it and pick a date." : "Drafts without a date."}</p>
          {undated.length ? <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1">{undated.map((p) => chip(p, true))}</div> : <p className="text-caption text-muted">None.</p>}
        </aside>
      </div>

      <dialog ref={dialogRef} aria-labelledby="post-quick-title" onClose={() => setOpen(null)} className="m-auto w-[min(94vw,560px)] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/40">
        {openPost ? <QuickView post={openPost} campaign={openPost.campaignId ? campaignById.get(openPost.campaignId) : undefined} canWrite={canWrite} onMove={(day) => { move(openPost.id, day); dialogRef.current?.close(); }} onClose={() => dialogRef.current?.close()} /> : null}
      </dialog>
    </div>
  );
}

function PostChip({ post, campaign, draggable, onOpen, compact }: { post: CalendarPost; campaign?: Campaign; draggable: boolean; onOpen: () => void; compact?: boolean }) {
  const color = campaign?.color ?? "#94a3b8";
  const due = isManualDue(post);
  const label = post.title || post.caption.split("\n")[0] || "Untitled post";
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-post-id", post.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      aria-label={`${label}. ${STATUS_LABEL[post.status]}${post.at ? `, ${timeFmt.format(Date.parse(post.at))}` : ""}${due ? ", manual posting due" : ""}${campaign ? `, campaign ${campaign.name}` : ""}`}
      className={cn(
        "w-full rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        draggable && "cursor-grab active:cursor-grabbing",
        post.status === "draft" && "outline-1 -outline-offset-1 outline-border outline-dashed",
        post.status === "published" && "opacity-70",
        post.status === "cancelled" && "line-through opacity-50",
        post.status === "failed" && "ring-1 ring-error ring-inset",
      )}
      style={{ borderLeftColor: color, backgroundColor: `${color}1f` }}
    >
      <span className="block truncate font-medium">{label}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-0.5">
        {post.at && !compact ? <span className="mr-0.5 text-muted tabular-nums">{timeFmt.format(Date.parse(post.at)).replace(" ", "\u00a0")}</span> : null}
        {post.channels.map((c) => <ChannelChip key={c} channel={c} done={post.manualDone.includes(c)} />)}
        <span className={cn("ml-auto text-[10px]", post.status === "failed" ? "text-error" : due ? "font-semibold text-warning" : "text-muted")}>{due ? "Post now" : STATUS_LABEL[post.status]}</span>
      </span>
    </button>
  );
}

function QuickView({ post, campaign, canWrite, onMove, onClose }: { post: CalendarPost; campaign?: Campaign; canWrite: boolean; onMove: (day: string) => void; onClose: () => void }) {
  const uid = useId();
  const [day, setDay] = useState(post.at ? keyOf(post.at) : "");
  const img = assetUrl(post.imagePath);
  return (
    <div className="max-h-[85vh] space-y-4 overflow-y-auto p-5">
      <div className="flex items-start gap-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="size-16 shrink-0 rounded-md border border-border object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id="post-quick-title" className="text-h3 break-words">{post.title || "Untitled post"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
            <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
            {post.at ? formatDateTime(post.at) : "No date"}
            {campaign ? <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: campaign.color }} aria-hidden />{campaign.name}</span> : null}
          </p>
          <p className="mt-1 flex flex-wrap gap-1">{post.channels.map((c) => <ChannelChip key={c} channel={c} done={post.manualDone.includes(c)} />)}</p>
        </div>
      </div>
      <p className="line-clamp-4 text-small whitespace-pre-line">{post.caption || <span className="text-muted">No caption</span>}</p>
      {isManualDue(post) ? <ManualPostPanel post={post} imageUrl={img} canWrite={canWrite} /> : null}
      {canWrite && MOVABLE.has(post.status) ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (day) onMove(day);
          }}
        >
          <div>
            <label htmlFor={`${uid}-move`} className="mb-1.5 block text-label">Move to…</label>
            <input id={`${uid}-move`} type="date" value={day} onChange={(e) => setDay(e.target.value)} className={cn(inputClassName, "h-8 py-0")} required />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!day || (!!post.at && day === keyOf(post.at))}>Move</Button>
          <span className="pb-1.5 text-caption text-muted">Keeps the time ({timeOf(post.at)} IST).</span>
        </form>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Link href={`${BASE}/posts/${post.id}`} className={buttonClass({ size: "sm" })}>Open post</Link>
      </div>
    </div>
  );
}
