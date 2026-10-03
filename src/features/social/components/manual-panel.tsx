"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { InlineAction } from "@/features/settings/ui/action-controls";
import { markChannelPostedAction } from "../planner-actions";
import { CHANNEL_LABELS, isAutoPlatform, type Channel } from "../compose";
import { CHANNEL_META, ChannelChip } from "./channels";

export type ManualPost = { id: string; caption: string; hashtags: string[]; linkUrl: string | null; channels: Channel[]; manualDone: Channel[]; at: string | null };

export const manualChannels = (p: Pick<ManualPost, "channels">) => p.channels.filter((c) => !isAutoPlatform(c));
/** Due = has a time within the next hour (or past) and a planned channel not yet marked posted. */
export const isManualDue = (p: ManualPost, now = Date.now()) => !!p.at && Date.parse(p.at) <= now + 3600_000 && manualChannels(p).some((c) => !p.manualDone.includes(c));

/** Copy / download / open / mark-posted helper for planned (manual) channels. */
export function ManualPostPanel({ post, imageUrl, canWrite }: { post: ManualPost; imageUrl: string | null; canWrite: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  const channels = manualChannels(post);
  if (!channels.length) return null;

  const textFor = (c: Channel) => [post.caption.trim(), c !== "youtube" && post.linkUrl ? post.linkUrl : "", post.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const copy = async (c: Channel) => {
    try {
      await navigator.clipboard.writeText(textFor(c));
      setCopied(c);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("error");
    }
  };
  const download = async () => {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: imageUrl.split("/").pop()?.split("?")[0] || "post-image" });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank", "noopener");
    }
  };

  return (
    <section aria-label="Post manually" className="space-y-3 rounded-lg border border-accent/30 bg-accent-soft/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-label">Post manually</h3>
        {imageUrl ? (
          <Button size="sm" variant="secondary" onClick={download}>
            <Download aria-hidden /> Download image
          </Button>
        ) : null}
      </div>
      <p className="text-caption text-muted">These channels aren&apos;t posted automatically. Copy the caption, open the network, post it, then mark it posted.</p>
      <ul className="space-y-2">
        {channels.map((c) => {
          const done = post.manualDone.includes(c);
          return (
            <li key={c} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2">
              <ChannelChip channel={c} />
              <span className="min-w-20 flex-1 text-small font-medium">
                {CHANNEL_LABELS[c]}
                {done ? <span className="ml-2 inline-flex items-center gap-1 text-caption text-success"><Check className="size-3.5" aria-hidden />Posted</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => copy(c)} aria-label={`Copy caption for ${CHANNEL_LABELS[c]}`}>
                {copied === c ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied === c ? "Copied" : "Copy caption"}
              </Button>
              <a href={CHANNEL_META[c].openUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "sm" })}>
                <ExternalLink aria-hidden /> Open {CHANNEL_META[c].openLabel}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {canWrite ? (
                <InlineAction action={markChannelPostedAction} fields={done ? { id: post.id, channel: c, undo: "1" } : { id: post.id, channel: c }} label={done ? "Undo" : "Mark posted"} variant={done ? "ghost" : "primary"} />
              ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {copied === "error" ? <p role="alert" className="text-caption text-error">Couldn&apos;t copy. Select the caption text and copy it yourself.</p> : null}
      <span role="status" className="sr-only">{copied && copied !== "error" ? "Caption copied" : ""}</span>
    </section>
  );
}
