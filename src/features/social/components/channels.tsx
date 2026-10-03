import { cn } from "@/lib/cn";
import { CHANNEL_LABELS, type Channel, type PostStatus } from "../compose";

/** Display metadata per channel (UI only). Brand colours are used for small initials chips. */
export const CHANNEL_META: Record<Channel, { short: string; color: string; limit: number; openUrl: string; openLabel: string }> = {
  facebook: { short: "Fb", color: "#1877F2", limit: 5000, openUrl: "https://www.facebook.com/", openLabel: "Facebook" },
  instagram: { short: "Ig", color: "#E1306C", limit: 2200, openUrl: "https://www.instagram.com/", openLabel: "Instagram" },
  pinterest: { short: "Pi", color: "#E60023", limit: 500, openUrl: "https://www.pinterest.com/pin-builder/", openLabel: "Pinterest" },
  google: { short: "G", color: "#4285F4", limit: 1500, openUrl: "https://business.google.com/", openLabel: "Google Business" },
  whatsapp: { short: "Wa", color: "#25D366", limit: 700, openUrl: "https://web.whatsapp.com/", openLabel: "WhatsApp" },
  x: { short: "X", color: "#111111", limit: 280, openUrl: "https://x.com/compose/post", openLabel: "X" },
  linkedin: { short: "In", color: "#0A66C2", limit: 3000, openUrl: "https://www.linkedin.com/feed/", openLabel: "LinkedIn" },
  threads: { short: "Th", color: "#333333", limit: 500, openUrl: "https://www.threads.net/", openLabel: "Threads" },
  youtube: { short: "Yt", color: "#FF0000", limit: 5000, openUrl: "https://studio.youtube.com/", openLabel: "YouTube" },
};

export function ChannelChip({ channel, done, className }: { channel: Channel; done?: boolean; className?: string }) {
  const m = CHANNEL_META[channel];
  return (
    <span
      title={`${CHANNEL_LABELS[channel]}${done ? " (posted)" : ""}`}
      className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[10px] leading-none font-semibold text-white", done && "opacity-50 line-through", className)}
      style={{ backgroundColor: m.color }}
    >
      {m.short}
      <span className="sr-only"> {CHANNEL_LABELS[channel]}</span>
    </span>
  );
}

export const STATUS_TONE: Record<PostStatus, "neutral" | "info" | "warning" | "success" | "error" | "accent"> = {
  draft: "neutral",
  planned: "accent",
  scheduled: "info",
  publishing: "warning",
  published: "success",
  failed: "error",
  cancelled: "neutral",
};
export const STATUS_LABEL: Record<PostStatus, string> = { draft: "Draft", planned: "Planned", scheduled: "Scheduled", publishing: "Publishing", published: "Published", failed: "Failed", cancelled: "Cancelled" };
