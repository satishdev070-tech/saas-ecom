"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hash, ImagePlus, X } from "lucide-react";
import { SelectField, TextAreaField, TextField, inputClassName } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { MediaPicker } from "@/features/media/components/media-picker";
import { cn } from "@/lib/cn";
import { savePostAction } from "../actions";
import { createPostFromProductAction } from "../planner-actions";
import { CHANNEL_LABELS, CONTENT_PILLARS, MANUAL_CHANNELS, PILLAR_LABELS, SOCIAL_PLATFORMS, normalizeHashtags, type Channel, type ContentPillar, type SocialPlatform } from "../compose";
import type { Campaign, HashtagSet } from "../planner-types";
import { CHANNEL_META, ChannelChip } from "./channels";

export type ComposerValue = {
  id?: string;
  title: string;
  caption: string;
  hashtags: string;
  mediaPath: string;
  mediaUrl: string | null;
  linkUrl: string;
  platforms: Channel[];
  /** "YYYY-MM-DDTHH:mm" IST. */
  scheduledAt: string;
  notes: string;
  pillar: ContentPillar | "";
  campaignId: string;
};

/** Text a network would show: caption, link (Facebook, planned channels), hashtags (not Pinterest). */
function previewText(c: Channel, caption: string, tags: string[], link: string): string {
  const parts = [caption.trim()];
  if (link && c !== "instagram" && c !== "pinterest") parts.push(link);
  if (tags.length && c !== "pinterest") parts.push(tags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

export function PostComposer({
  value,
  connected,
  campaigns = [],
  hashtagSets = [],
  products = [],
}: {
  value?: Partial<ComposerValue>;
  connected: SocialPlatform[];
  campaigns?: Campaign[];
  hashtagSets?: HashtagSet[];
  products?: { id: string; title: string }[];
}) {
  const uid = useId();
  const [state, action, pending] = useActionState(savePostAction, null);
  const [media, setMedia] = useState<{ path: string; url: string | null }>({ path: value?.mediaPath ?? "", url: value?.mediaUrl ?? null });
  const [caption, setCaption] = useState(value?.caption ?? "");
  const [hashtags, setHashtags] = useState(value?.hashtags ?? "");
  const [link, setLink] = useState(value?.linkUrl ?? "");
  const [at, setAt] = useState(value?.scheduledAt ?? "");
  const [channels, setChannels] = useState<Channel[]>(value?.platforms?.length ? value.platforms : connected);
  const [setPick, setSetPick] = useState("");
  const errors = state && !state.ok ? (state.error.fieldErrors ?? {}) : {};
  const tags = normalizeHashtags(hashtags);
  const autoSelected = channels.some((c) => (connected as Channel[]).includes(c));

  const toggle = (c: Channel, on: boolean) => setChannels((cur) => (on ? [...cur.filter((x) => x !== c), c] : cur.filter((x) => x !== c)));
  const insertSet = () => {
    const s = hashtagSets.find((h) => h.id === setPick);
    if (s) setHashtags(normalizeHashtags([...tags, ...s.tags]).join(" "));
  };

  return (
    <div className="space-y-5">
      {!value?.id && products.length ? <StartFromProduct products={products} /> : null}
      <form action={action} className="space-y-5">
        {value?.id ? <input type="hidden" name="id" value={value.id} /> : null}
        <input type="hidden" name="mediaPath" value={media.path} />
        <FormMessage state={state} success={state?.ok ? <>{state.data} <Link href="/dashboard/marketing/social/calendar" className="underline">Open calendar</Link></> : null} />
        <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          <div>
            {media.url ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.url} alt="Post image" className="aspect-square w-full max-w-[240px] rounded-md border border-border object-cover" />
                <button type="button" onClick={() => setMedia({ path: "", url: null })} aria-label="Remove image" className="absolute top-1 left-1 rounded-full bg-black/60 p-1 text-white focus-visible:outline-2 focus-visible:outline-accent">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex aspect-square w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted">
                <ImagePlus className="size-6" aria-hidden />
                <span className="text-caption">Square or 4:5 works best</span>
              </div>
            )}
            <div className="mt-2">
              <MediaPicker folder="social" title="Choose a post image" triggerLabel={media.url ? "Change image" : "Choose image"} onSelect={(items) => items[0] && setMedia({ path: items[0].path, url: items[0].url })} />
            </div>
            {errors.mediaPath ? <p role="alert" className="mt-1 text-caption text-error">{errors.mediaPath[0]}</p> : null}
          </div>

          <div className="min-w-0 space-y-4">
            <TextField label="Title" name="title" defaultValue={value?.title ?? ""} maxLength={120} placeholder="Diwali offer teaser" hint="Only you see this, on the calendar." errors={errors.title} optional />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Campaign" name="campaignId" defaultValue={value?.campaignId ?? ""} options={[{ value: "", label: "No campaign" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} errors={errors.campaignId} />
              <SelectField label="Content pillar" name="pillar" defaultValue={value?.pillar ?? ""} options={[{ value: "", label: "None" }, ...CONTENT_PILLARS.map((p) => ({ value: p, label: PILLAR_LABELS[p] }))]} errors={errors.pillar} />
            </div>
            <TextAreaField label="Caption" name="caption" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} errors={errors.caption} />
            {channels.length ? (
              <ul aria-label="Length per network" className="-mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption">
                {channels.map((c) => {
                  const n = previewText(c, caption, tags, link).length;
                  const over = n > CHANNEL_META[c].limit;
                  return (
                    <li key={c} className={over ? "font-medium text-error" : "text-muted"}>
                      {CHANNEL_LABELS[c]} {n.toLocaleString("en-IN")}/{CHANNEL_META[c].limit.toLocaleString("en-IN")}
                      {over ? <span className="sr-only"> (too long)</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div>
              <TextField label="Hashtags" name="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#handloom #kurta #festive" hint={`${tags.length}/30. Not added to Pinterest.`} errors={errors.hashtags} optional />
              {hashtagSets.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label htmlFor={`${uid}-set`} className="sr-only">Hashtag set</label>
                  <select id={`${uid}-set`} value={setPick} onChange={(e) => setSetPick(e.target.value)} className={cn(inputClassName, "h-8 w-auto py-0 text-small")}>
                    <option value="">Choose a hashtag set…</option>
                    {hashtagSets.map((h) => (
                      <option key={h.id} value={h.id}>{h.name} ({h.tags.length})</option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={insertSet} disabled={!setPick}>
                    <Hash aria-hidden /> Insert set
                  </Button>
                </div>
              ) : null}
            </div>
            <TextField label="Link" name="linkUrl" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourstore.in/products/…" hint="Added to Facebook posts and as the Pin link. Instagram captions can't hold clickable links." errors={errors.linkUrl} optional />

            <fieldset className="space-y-3">
              <legend className="mb-1.5 text-label">Channels</legend>
              <div>
                <p className="mb-1.5 text-caption font-medium text-muted">Auto-publish</p>
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_PLATFORMS.map((p) => {
                    const ok = connected.includes(p);
                    return (
                      <label key={p} className={cn("flex min-h-9 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-small has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/30", ok ? "cursor-pointer" : "opacity-50")}>
                        <input type="checkbox" name="platforms" value={p} checked={ok && channels.includes(p)} onChange={(e) => toggle(p, e.target.checked)} disabled={!ok} />
                        <ChannelChip channel={p} />
                        {CHANNEL_LABELS[p]}
                        {!ok ? <span className="text-caption">(not connected)</span> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-caption font-medium text-muted">Planned (manual): we remind you, you post</p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_CHANNELS.map((c) => (
                    <label key={c} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-small has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/30">
                      <input type="checkbox" name="platforms" value={c} checked={channels.includes(c)} onChange={(e) => toggle(c, e.target.checked)} />
                      <ChannelChip channel={c} />
                      {CHANNEL_LABELS[c]}
                    </label>
                  ))}
                </div>
              </div>
              {errors.platforms ? <p role="alert" className="text-caption text-error">{errors.platforms[0]}</p> : null}
            </fieldset>
            <TextAreaField label="Notes" name="notes" rows={2} defaultValue={value?.notes ?? ""} maxLength={2000} placeholder="Shoot idea, who posts it, approvals…" errors={errors.notes} optional />

            <div className="space-y-3 border-t border-border pt-4">
              <TextField label="Date and time (IST)" name="scheduledAt" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} errors={errors.scheduledAt} className="max-w-xs" hint="Needed to plan or schedule." />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="draft" variant="ghost" size="sm" disabled={pending}>Save draft</Button>
                <Button type="submit" name="intent" value="plan" variant="secondary" size="sm" disabled={pending || !at || !channels.length}>Plan for date</Button>
                <Button type="submit" name="intent" value="schedule" variant="secondary" size="sm" disabled={pending || !at || !autoSelected}>Schedule</Button>
                <Button type="submit" name="intent" value="publish" size="sm" pending={pending} disabled={!autoSelected}>Publish now</Button>
              </div>
              <p className="text-caption text-muted">
                {autoSelected ? "Schedule and Publish post automatically to the connected networks; planned channels get a reminder." : "Schedule and Publish need a connected auto-publish channel. Plan for date puts the post on your calendar as a reminder."}
              </p>
            </div>
          </div>

          <aside aria-label="Preview" className="min-w-0 space-y-3 lg:col-span-2 xl:col-span-1">
            <h3 className="text-label">Preview</h3>
            {!channels.length ? <p className="text-caption text-muted">Pick a channel to see a preview.</p> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {channels.map((c) => (
                <PreviewCard key={c} channel={c} text={previewText(c, caption, tags, link)} image={media.url} />
              ))}
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}

function PreviewCard({ channel, text, image }: { channel: Channel; text: string; image: string | null }) {
  const limit = CHANNEL_META[channel].limit;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface text-small shadow-xs">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ChannelChip channel={channel} />
        <span className="font-medium">{CHANNEL_LABELS[channel]}</span>
        <span className={cn("ml-auto text-caption tabular-nums", text.length > limit ? "text-error" : "text-muted")}>{text.length > limit ? `${text.length - limit} over` : `${limit - text.length} left`}</span>
      </div>
      {image && channel !== "x" && channel !== "whatsapp" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={cn("w-full object-cover", channel === "pinterest" ? "aspect-[2/3]" : channel === "instagram" ? "aspect-[4/5]" : "aspect-video")} />
      ) : null}
      <div className="px-3 py-2"><p className="line-clamp-6 break-words whitespace-pre-line">
        {text ? (text.length > limit ? <>{text.slice(0, limit)}<span className="bg-error/15 text-error">{text.slice(limit)}</span></> : text) : <span className="text-muted">Your caption appears here.</span>}
      </p></div>
      {image && (channel === "x" || channel === "whatsapp") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="mx-3 mb-3 aspect-video w-[calc(100%-1.5rem)] rounded-md object-cover" />
      ) : null}
    </div>
  );
}

function StartFromProduct({ products }: { products: { id: string; title: string }[] }) {
  const router = useRouter();
  const uid = useId();
  const [state, action] = useActionState(createPostFromProductAction, null);
  useEffect(() => {
    if (state?.ok && state.data) router.push(`/dashboard/marketing/social/posts/${state.data}`);
  }, [state, router]);
  return (
    <form action={action} className="rounded-lg border border-dashed border-border bg-surface-secondary/40 p-3">
      <FormMessage state={state && !state.ok ? state : null} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`${uid}-p`} className="mb-1.5 block text-label">Start from a product</label>
          <select id={`${uid}-p`} name="productId" required className={inputClassName} defaultValue="">
            <option value="" disabled>Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <SubmitButton variant="secondary">Create draft</SubmitButton>
      </div>
      <p className="mt-1.5 text-caption text-muted">We draft a post with the product image, a caption with its price and a tracked link.</p>
    </form>
  );
}
