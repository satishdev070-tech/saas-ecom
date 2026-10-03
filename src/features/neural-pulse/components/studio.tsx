"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CalendarPlus, Copy, Lightbulb, PenLine, CalendarRange, History, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { inputClassName, Label, Hint } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { PILLAR_LABELS, type Channel } from "@/features/social/compose";
import { ChannelChip } from "@/features/social/components/channels";
import { addToCalendarAction, generateCaptionAction, generateIdeasAction, generatePlanAction } from "../actions";
import { captionOutput, FORMAT_LABELS, ideasOutput, planOutput, PROVIDER_LABELS, type AiProvider, type BrandProfile, type CalendarItem, type CaptionSet, type ContentIdea, type GenerationRow, type PlanPost } from "../schemas";
import { BrandForm } from "./brand-form";

type Tab = "ideas" | "caption" | "plan" | "brand" | "history";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "ideas", label: "Content ideas", icon: <Lightbulb aria-hidden className="size-4" /> },
  { id: "caption", label: "Captions", icon: <PenLine aria-hidden className="size-4" /> },
  { id: "plan", label: "Content plan", icon: <CalendarRange aria-hidden className="size-4" /> },
  { id: "brand", label: "Brand profile", icon: <UserRound aria-hidden className="size-4" /> },
  { id: "history", label: "History", icon: <History aria-hidden className="size-4" /> },
];

type Meta = { provider: AiProvider; model: string };
type Msg = { ok: boolean; text: string } | null;
const errText = (e: { message: string; fieldErrors?: Record<string, string[]> }) => e.fieldErrors?._form?.[0] ?? Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message;

function Banner({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("rounded-md border px-3 py-2 text-small", msg.ok ? "border-success/25 bg-success/10 text-success" : "border-error/25 bg-error/10 text-error")}>
      {msg.text}
    </p>
  );
}

function MetaLine({ meta }: { meta: Meta | null }) {
  return meta ? <p className="text-caption text-muted">Written by {PROVIDER_LABELS[meta.provider]} ({meta.model}). Check facts and prices before posting.</p> : null;
}

function Channels({ list }: { list: Channel[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((c) => (
        <ChannelChip key={c} channel={c} />
      ))}
    </span>
  );
}

function useCalendar() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const add = (mode: "draft" | "plan", items: CalendarItem[]) =>
    start(async () => {
      setMsg(null);
      const r = await addToCalendarAction({ mode, items });
      setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: errText(r.error) });
    });
  return { pending, msg, add };
}

const ideaToItem = (i: ContentIdea): CalendarItem => ({ title: i.title, caption: i.hook, hashtags: [], pillar: i.pillar, channels: i.channels, notes: [`Format: ${FORMAT_LABELS[i.format]}`, i.notes].filter(Boolean).join("\n") });
const planToItem = (p: PlanPost): CalendarItem => ({ title: p.title, caption: p.caption, hashtags: p.hashtags, pillar: p.pillar, channels: p.channels, date: p.date, time: p.time, notes: [`Format: ${FORMAT_LABELS[p.format]}`, p.keyDate ? `Key date: ${p.keyDate}` : ""].filter(Boolean).join("\n") });

// ---------- Ideas ----------

export function IdeasList({ ideas, canWrite, onCaption }: { ideas: ContentIdea[]; canWrite: boolean; onCaption?: (idea: ContentIdea) => void }) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set(ideas.map((_, i) => i)));
  const cal = useCalendar();
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 md:grid-cols-2">
        {ideas.map((idea, i) => (
          <li key={i} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start gap-2">
              {canWrite ? <input type="checkbox" aria-label={`Select ${idea.title}`} checked={picked.has(i)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} className="mt-1 size-4 accent-[var(--accent)]" /> : null}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium">{idea.title}</p>
                <p className="text-small">{idea.hook}</p>
                {idea.notes ? <p className="text-caption text-muted">{idea.notes}</p> : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="accent">{FORMAT_LABELS[idea.format]}</Badge>
                  <Badge>{PILLAR_LABELS[idea.pillar]}</Badge>
                  <Channels list={idea.channels} />
                </div>
                {onCaption && canWrite ? (
                  <button type="button" className="text-small font-medium text-accent hover:underline" onClick={() => onCaption(idea)}>
                    Write the caption
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" pending={cal.pending} disabled={!picked.size} onClick={() => cal.add("draft", ideas.filter((_, i) => picked.has(i)).map(ideaToItem))}>
            <CalendarPlus aria-hidden /> Save {picked.size} as drafts
          </Button>
          <span className="text-caption text-muted">Drafts appear on the calendar&apos;s unscheduled list.</span>
        </div>
      ) : null}
      <Banner msg={cal.msg} />
    </div>
  );
}

function IdeasPanel({ canWrite, aiReady, onCaption }: { canWrite: boolean; aiReady: boolean; onCaption: (idea: ContentIdea) => void }) {
  const [focus, setFocus] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<({ ideas: ContentIdea[] } & Meta) | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await generateIdeasAction({ focus });
      if (r.ok) setRes(r.data);
      else setMsg({ ok: false, text: errText(r.error) });
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="np-focus" optional>
            Focus for this batch
          </Label>
          <input id="np-focus" className={inputClassName} maxLength={300} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Diwali gifting under ₹1,000" />
        </div>
        <Button onClick={run} pending={pending} disabled={!canWrite || !aiReady}>
          Generate 10 ideas
        </Button>
      </div>
      <Banner msg={msg} />
      {res ? (
        <>
          <MetaLine meta={res} />
          <IdeasList key={res.ideas.map((i) => i.title).join("|")} ideas={res.ideas} canWrite={canWrite} onCaption={onCaption} />
        </>
      ) : null}
    </div>
  );
}

// ---------- Captions ----------

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the text is still selectable */
        }
      }}
    >
      <Copy aria-hidden /> {done ? "Copied" : "Copy"}
    </Button>
  );
}

export function CaptionView({ set, title, canWrite }: { set: CaptionSet; title: string; canWrite: boolean }) {
  const cal = useCalendar();
  const tags = set.hashtags.join(" ");
  const variants: { key: "instagram" | "facebook" | "x"; label: string; limit: number }[] = [
    { key: "instagram", label: "Instagram", limit: 2200 },
    { key: "facebook", label: "Facebook", limit: 2200 },
    { key: "x", label: "X", limit: 280 },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {variants.map((v) => (
          <div key={v.key} className="flex flex-col rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-label">{v.label}</p>
              <span className="text-caption text-muted">
                {set[v.key].length}/{v.limit}
              </span>
            </div>
            <p className="flex-1 text-small whitespace-pre-wrap">{set[v.key]}</p>
            <div className="mt-2 flex justify-end">
              <CopyButton text={v.key === "instagram" && tags ? `${set[v.key]}\n\n${tags}` : set[v.key]} />
            </div>
          </div>
        ))}
      </div>
      {tags ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <p className="flex-1 text-small text-accent">{tags}</p>
          <CopyButton text={tags} />
        </div>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" pending={cal.pending} onClick={() => cal.add("draft", [{ title, caption: set.instagram, hashtags: set.hashtags, channels: ["instagram", "facebook"], notes: `Facebook variant:\n${set.facebook}`.slice(0, 2000) }])}>
            <CalendarPlus aria-hidden /> Save Instagram + Facebook draft
          </Button>
          <Button variant="secondary" size="sm" pending={cal.pending} onClick={() => cal.add("draft", [{ title: `${title} (X)`.slice(0, 120), caption: set.x, hashtags: [], channels: ["x"] }])}>
            <CalendarPlus aria-hidden /> Save X draft
          </Button>
        </div>
      ) : null}
      <Banner msg={cal.msg} />
    </div>
  );
}

function CaptionPanel({ canWrite, aiReady, products, idea, setIdea }: { canWrite: boolean; aiReady: boolean; products: { id: string; title: string }[]; idea: string; setIdea: (s: string) => void }) {
  const [productId, setProductId] = useState("");
  const [pending, start] = useTransition();
  const [res, setRes] = useState<(CaptionSet & Meta & { title: string }) | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await generateCaptionAction({ productId, idea });
      if (r.ok) setRes({ ...r.data, title: products.find((p) => p.id === productId)?.title.slice(0, 120) ?? (idea.split("\n")[0]?.slice(0, 80) || "AI caption") });
      else setMsg({ ok: false, text: errText(r.error) });
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="np-product" optional>
            Product
          </Label>
          <select id="np-product" className={inputClassName} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">No specific product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <Hint>Uses the product&apos;s title, price and summary.</Hint>
        </div>
        <div>
          <Label htmlFor="np-idea" optional>
            Post idea or angle
          </Label>
          <textarea id="np-idea" rows={3} maxLength={800} className={inputClassName} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. Behind the scenes: how we block-print each dupatta" />
        </div>
      </div>
      <Button onClick={run} pending={pending} disabled={!canWrite || !aiReady || (!productId && !idea.trim())}>
        Write caption + hashtags
      </Button>
      <Banner msg={msg} />
      {res ? (
        <>
          <MetaLine meta={res} />
          <CaptionView set={res} title={res.title} canWrite={canWrite} />
        </>
      ) : null}
    </div>
  );
}

// ---------- Plan ----------

const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function PlanTable({ posts, canWrite }: { posts: PlanPost[]; canWrite: boolean }) {
  const [picked, setPicked] = useState<Set<number>>(() => new Set(posts.map((_, i) => i)));
  const cal = useCalendar();
  const chosen = () => posts.filter((_, i) => picked.has(i)).map(planToItem);
  return (
    <div className="space-y-3">
      <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
        {posts.map((p, i) => (
          <li key={i} className="flex gap-3 p-3">
            {canWrite ? <input type="checkbox" aria-label={`Select ${p.title}`} checked={picked.has(i)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} className="mt-1 size-4 accent-[var(--accent)]" /> : null}
            <div className="w-24 shrink-0 text-small">
              <p className="font-medium">{dayFmt.format(Date.parse(`${p.date}T00:00:00Z`))}</p>
              <p className="text-muted">{p.time ?? "11:00"} IST</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">{p.title}</p>
              <p className="line-clamp-3 text-small whitespace-pre-wrap text-muted">{p.caption}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">{FORMAT_LABELS[p.format]}</Badge>
                <Badge>{PILLAR_LABELS[p.pillar]}</Badge>
                {p.keyDate ? <Badge tone="warning">{p.keyDate}</Badge> : null}
                <Channels list={p.channels} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" pending={cal.pending} disabled={!picked.size} onClick={() => cal.add("plan", chosen())}>
            <CalendarPlus aria-hidden /> Plan {picked.size} on calendar
          </Button>
          <Button variant="secondary" size="sm" pending={cal.pending} disabled={!picked.size} onClick={() => cal.add("draft", chosen())}>
            Save as drafts
          </Button>
          <span className="text-caption text-muted">Planned posts are never published automatically. Add an image and schedule them from the calendar.</span>
        </div>
      ) : null}
      <Banner msg={cal.msg} />
    </div>
  );
}

function PlanPanel({ canWrite, aiReady, today }: { canWrite: boolean; aiReady: boolean; today: string }) {
  const [form, setForm] = useState({ weeks: "2", postsPerWeek: "4", startDate: today, focus: "" });
  const [pending, start] = useTransition();
  const [res, setRes] = useState<({ posts: PlanPost[] } & Meta) | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await generatePlanAction(form);
      if (r.ok) setRes(r.data);
      else setMsg({ ok: false, text: errText(r.error) });
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="np-weeks">Length</Label>
          <select id="np-weeks" className={inputClassName} value={form.weeks} onChange={(e) => setForm((f) => ({ ...f, weeks: e.target.value }))}>
            <option value="2">2 weeks</option>
            <option value="4">4 weeks</option>
          </select>
        </div>
        <div>
          <Label htmlFor="np-ppw">Posts per week</Label>
          <select id="np-ppw" className={inputClassName} value={form.postsPerWeek} onChange={(e) => setForm((f) => ({ ...f, postsPerWeek: e.target.value }))}>
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="np-start">Start date</Label>
          <input id="np-start" type="date" className={inputClassName} min={today} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="np-pfocus" optional>
            Focus
          </Label>
          <input id="np-pfocus" className={inputClassName} maxLength={300} value={form.focus} onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))} placeholder="e.g. new winter collection" />
        </div>
      </div>
      <Button onClick={run} pending={pending} disabled={!canWrite || !aiReady}>
        Build the plan
      </Button>
      <p className="text-caption text-muted">Balanced across your content pillars and the key dates in that window (your own dates from the planner plus built-in occasions).</p>
      <Banner msg={msg} />
      {res ? (
        <>
          <MetaLine meta={res} />
          {res.posts.length ? <PlanTable key={res.posts.map((p) => p.date + p.title).join("|")} posts={res.posts} canWrite={canWrite} /> : <p className="text-small text-muted">The plan came back empty for that window. Try again.</p>}
        </>
      ) : null}
    </div>
  );
}

// ---------- History ----------

const KIND_LABEL: Record<string, string> = { ideas: "Content ideas", caption: "Caption", hashtags: "Hashtags", plan: "Content plan", profile: "Brand / profile draft", review_reply: "Review reply", message_reply: "Message reply" };
const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function HistoryOutput({ row, canWrite }: { row: GenerationRow; canWrite: boolean }) {
  if (row.kind === "ideas") {
    const p = ideasOutput.safeParse(row.output);
    if (p.success) return <IdeasList ideas={p.data.ideas.slice(0, 10)} canWrite={canWrite} />;
  }
  if (row.kind === "plan") {
    const p = planOutput.safeParse(row.output);
    if (p.success) return <PlanTable posts={p.data.posts} canWrite={canWrite} />;
  }
  if (row.kind === "caption") {
    const p = captionOutput.safeParse(row.output);
    if (p.success) return <CaptionView set={p.data} title="AI caption" canWrite={canWrite} />;
  }
  const o = row.output as Record<string, unknown> | null;
  const text = o && typeof o === "object" ? (typeof o.reply === "string" ? o.reply : typeof o.description === "string" ? o.description : null) : null;
  if (text) return <p className="text-small whitespace-pre-wrap">{text}</p>;
  if (o && typeof o === "object" && typeof o.voice === "string")
    return (
      <dl className="grid gap-1 text-small">
        {(["voice", "audience", "dos", "donts"] as const).map((k) => (typeof o[k] === "string" ? <div key={k}><dt className="inline font-medium capitalize">{k === "donts" ? "Don'ts" : k === "dos" ? "Do's" : k}: </dt><dd className="inline">{String(o[k])}</dd></div> : null))}
      </dl>
    );
  return <p className="text-small text-muted">This result can&apos;t be shown.</p>;
}

function HistoryPanel({ rows, canWrite }: { rows: GenerationRow[]; canWrite: boolean }) {
  if (!rows.length) return <p className="text-small text-muted">Nothing generated yet. Your last 30 generations will show up here.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <details className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-small">
              <span className="font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
              <span className="text-muted">{timeFmt.format(Date.parse(r.createdAt))}</span>
              <span className="ml-auto text-caption text-muted">
                {PROVIDER_LABELS[r.provider as AiProvider] ?? r.provider}
                {r.model ? ` · ${r.model}` : ""}
                {r.tokens != null ? ` · ${r.tokens.toLocaleString("en-IN")} tokens` : ""}
              </span>
            </summary>
            <div className="border-t border-border p-3">
              <HistoryOutput row={r} canWrite={canWrite} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

// ---------- Shell ----------

export function NeuralPulseStudio(props: { brand: BrandProfile; canWrite: boolean; aiReady: boolean; products: { id: string; title: string }[]; history: GenerationRow[]; today: string }) {
  const [tab, setTab] = useState<Tab>(props.brand.voice || props.brand.audience ? "ideas" : "brand");
  const [captionIdea, setCaptionIdea] = useState("");
  return (
    <div>
      <div role="tablist" aria-label="Neural Pulse" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`np-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`np-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-small font-medium transition-colors", tab === t.id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`np-panel-${t.id}`} aria-labelledby={`np-tab-${t.id}`} hidden={tab !== t.id}>
          {t.id === "ideas" ? (
            <IdeasPanel
              canWrite={props.canWrite}
              aiReady={props.aiReady}
              onCaption={(i) => {
                setCaptionIdea(`${i.title}: ${i.hook}`.slice(0, 800));
                setTab("caption");
              }}
            />
          ) : null}
          {t.id === "caption" ? <CaptionPanel canWrite={props.canWrite} aiReady={props.aiReady} products={props.products} idea={captionIdea} setIdea={setCaptionIdea} /> : null}
          {t.id === "plan" ? <PlanPanel canWrite={props.canWrite} aiReady={props.aiReady} today={props.today} /> : null}
          {t.id === "brand" ? <BrandForm initial={props.brand} canWrite={props.canWrite} aiReady={props.aiReady} /> : null}
          {t.id === "history" ? <HistoryPanel rows={props.history} canWrite={props.canWrite} /> : null}
        </div>
      ))}
    </div>
  );
}

