/** Pure helpers for social posts (unit tested). */

/** Networks we publish to automatically (official APIs, OAuth). */
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "pinterest", "google"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
/**
 * Planned channels: on the calendar, never auto-published (no approved API access). When due, the
 * seller copies the caption and downloads the image, then marks the channel posted.
 */
export const MANUAL_CHANNELS = ["whatsapp", "x", "linkedin", "threads", "youtube"] as const;
export type ManualChannel = (typeof MANUAL_CHANNELS)[number];
export const ALL_CHANNELS = [...SOCIAL_PLATFORMS, ...MANUAL_CHANNELS] as const;
export type Channel = (typeof ALL_CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = { facebook: "Facebook", instagram: "Instagram", pinterest: "Pinterest", google: "Google Business", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn", threads: "Threads", youtube: "YouTube" };
export const isAutoPlatform = (c: string): c is SocialPlatform => (SOCIAL_PLATFORMS as readonly string[]).includes(c);

/** "planned" = on the calendar at scheduled_at but never claimed by the publish cron. */
export type PostStatus = "draft" | "planned" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export const CONTENT_PILLARS = ["product", "offer", "behind_scenes", "education", "customer", "festive", "announcement"] as const;
export type ContentPillar = (typeof CONTENT_PILLARS)[number];
export const PILLAR_LABELS: Record<ContentPillar, string> = { product: "Product", offer: "Offer", behind_scenes: "Behind the scenes", education: "How-to", customer: "Customer story", festive: "Festive", announcement: "Announcement" };
export type PlatformResult = { ok: boolean; id?: string; url?: string | null; error?: string; at: string };

/** Hashtags normalised to "#word" (letters, digits, underscore), unique, max 30 (Instagram's limit). */
export function normalizeHashtags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const out: string[] = [];
  for (const h of raw) {
    const tag = h.replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
    if (tag && !out.some((x) => x.toLowerCase() === `#${tag}`.toLowerCase())) out.push(`#${tag}`.slice(0, 60));
  }
  return out.slice(0, 30);
}

/** Final text for a platform: caption, then link (not for Instagram, where links aren't clickable), then hashtags. */
export function composeText(p: { caption: string; hashtags: string[]; link: string | null }, platform: SocialPlatform): string {
  const parts = [p.caption.trim()];
  if (p.link && platform === "facebook") parts.push(p.link);
  if (p.hashtags.length && platform !== "pinterest") parts.push(p.hashtags.join(" "));
  return parts.filter(Boolean).join("\n\n").slice(0, platform === "instagram" ? 2200 : 5000);
}

/**
 * Overall status from per-platform results, counting only auto-published networks (planned/manual
 * channels never have results): published if any succeeded, failed if none did.
 */
export function overallStatus(platforms: readonly string[], results: Partial<Record<SocialPlatform, PlatformResult>>): "published" | "failed" {
  return platforms.filter(isAutoPlatform).some((p) => results[p]?.ok) ? "published" : "failed";
}
