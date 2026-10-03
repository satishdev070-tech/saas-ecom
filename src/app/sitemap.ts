import type { MetadataRoute } from "next";
import { siteOrigin } from "@/features/marketing-site/site";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";

/**
 * Platform sitemap (public marketing pages only; sign-in, sign-up and onboarding are excluded).
 * Served on the platform host; on store hosts the proxy rewrites /sitemap.xml to the store's own.
 */
export const revalidate = 86400;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/features", priority: 0.8 },
    { path: "/themes", priority: 0.8 },
    { path: "/how-it-works", priority: 0.7 },
    { path: "/pricing", priority: 0.8 },
    { path: "/terms", priority: 0.2 },
    { path: "/privacy", priority: 0.2 },
  ];
  return [
    ...pages.map((p) => ({ url: `${origin}${p.path}`, changeFrequency: "weekly" as const, priority: p.priority })),
    ...MARKETPLACE_THEMES.map((t) => ({ url: `${origin}/themes/${t.key}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
