/**
 * Social planner contracts (shared by server queries, actions and UI). Implementations live in
 * ./planner-actions.ts (mutations) and ./server/planner.ts (queries).
 */
import type { Channel, ContentPillar, PlatformResult, PostStatus, SocialPlatform } from "./compose";

export type CalendarPost = {
  id: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  imagePath: string | null;
  linkUrl: string | null;
  channels: Channel[];
  status: PostStatus;
  /** ISO time the post is planned/scheduled for (null for undated drafts). */
  at: string | null;
  publishedAt: string | null;
  pillar: ContentPillar | null;
  campaignId: string | null;
  notes: string | null;
  /** Planned (manual) channels already marked posted. */
  manualDone: Channel[];
  results: Partial<Record<SocialPlatform, PlatformResult>>;
  productId: string | null;
};

export type Campaign = { id: string; name: string; color: string; goal: string | null; startsOn: string | null; endsOn: string | null };
export type HashtagSet = { id: string; name: string; tags: string[] };
export type MarketingDate = { id: string | null; title: string; onDate: string; kind: "sale" | "launch" | "festival" | "other"; notes: string | null; /** true for built-in fixed-date occasions (not editable). */ builtIn: boolean };

export type PlannerOverview = {
  connected: number;
  scheduledThisWeek: number;
  plannedThisWeek: number;
  published30d: number;
  failed: number;
  /** Planned posts whose time has passed with manual channels still not marked posted. */
  overdueManual: number;
  pillarMix: Partial<Record<ContentPillar, number>>;
};
