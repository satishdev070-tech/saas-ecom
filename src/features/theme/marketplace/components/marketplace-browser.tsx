"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Search } from "lucide-react";
import { ThemeMockup } from "../mockup";
import { ApplyThemeButton } from "../apply-button";
import { ThemePreviewDialog } from "./preview-dialog";
import { THEME_STYLE_LABELS, type ThemePreset, type ThemeStyle } from "../types";

export type MarketplaceCard = {
  key: string;
  name: string;
  tagline: string;
  industry: string;
  industryLabel: string;
  style: ThemeStyle;
  bestFor: string[];
  added: string;
  order: number;
  preset: ThemePreset;
  /** Live Preview URL on the theme's demo store, when that store exists. */
  previewUrl: string | null;
  status: "live" | "draft" | null;
};

type Sort = "featured" | "newest" | "name";

const STOREFRONT_WIDTH = 1280;
const STOREFRONT_HEIGHT = 2600;

/**
 * A lazy, scaled iframe gives each catalogue card the actual demo store instead of a
 * decorative approximation. Only cards that enter the viewport load their demo, and themes
 * without a seeded demo retain the token mockup as a graceful fallback.
 */
function ThemeCardPreview({ theme }: { theme: MarketplaceCard }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = frame.current;
    if (!element || !theme.previewUrl) return;
    const update = () => setScale(element.clientWidth / STOREFRONT_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [theme.previewUrl]);

  if (!theme.previewUrl) return <ThemeMockup preset={theme.preset} name={theme.name.split(" ")[0]!} />;

  return (
    <div ref={frame} className="relative h-full overflow-hidden bg-white" aria-hidden>
      {scale ? (
        <iframe
          src={theme.previewUrl}
          title=""
          tabIndex={-1}
          loading="lazy"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: STOREFRONT_WIDTH, height: STOREFRONT_HEIGHT, transform: `scale(${scale})` }}
        />
      ) : null}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] font-medium text-white">Live demo preview</span>
    </div>
  );
}

export function MarketplaceBrowser({
  themes,
  industries,
  initialIndustry,
  recommended,
  enabled,
  canPublish,
}: {
  themes: MarketplaceCard[];
  industries: { slug: string; label: string; count: number }[];
  initialIndustry: string;
  recommended: string | null;
  enabled: boolean;
  canPublish: boolean;
}) {
  const [industry, setIndustry] = useState(initialIndustry);
  const [style, setStyle] = useState<ThemeStyle | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const [preview, setPreview] = useState<MarketplaceCard | null>(null);

  const syncUrl = (next: string) => {
    const u = new URL(window.location.href);
    if (next) u.searchParams.set("industry", next);
    else u.searchParams.delete("industry");
    window.history.replaceState(null, "", u);
  };

  const styles = useMemo(() => [...new Set(themes.filter((t) => !industry || t.industry === industry).map((t) => t.style))], [themes, industry]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = themes.filter(
      (t) =>
        (!industry || t.industry === industry) &&
        (!style || t.style === style) &&
        (!needle || [t.name, t.tagline, t.industryLabel, THEME_STYLE_LABELS[t.style], ...t.bestFor].join(" ").toLowerCase().includes(needle)),
    );
    return out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return b.added.localeCompare(a.added) || a.order - b.order;
      // Featured: the seller's own industry first, then catalogue order.
      const ra = a.industry === recommended ? 0 : 1;
      const rb = b.industry === recommended ? 0 : 1;
      return ra - rb || a.order - b.order;
    });
  }, [themes, industry, style, q, sort, recommended]);

  const chip = (active: boolean) =>
    `relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small whitespace-nowrap ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-secondary"}`;

  return (
    <div className="space-y-5">
      <nav aria-label="Industries" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ slug: "", label: "All industries", count: themes.length }, ...industries].map((i) => (
          <button
            key={i.slug || "all"}
            type="button"
            aria-pressed={industry === i.slug}
            onClick={() => {
              setIndustry(i.slug);
              setStyle("");
              syncUrl(i.slug);
            }}
            className={chip(industry === i.slug)}
          >
            {i.label}
            <span className="text-caption opacity-70">
              {i.count}
              <span className="sr-only">{i.count === 1 ? " theme" : " themes"}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search themes</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search themes, styles, industries"
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-small"
          />
        </label>
        <label className="flex items-center gap-2 text-small">
          <span className="text-muted">Style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as ThemeStyle | "")} className="h-9 rounded-md border border-border bg-surface px-2 text-small">
            <option value="">All styles</option>
            {styles.map((s) => (
              <option key={s} value={s}>
                {THEME_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-small">
          <span className="text-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-md border border-border bg-surface px-2 text-small">
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <p className="text-small text-muted" aria-live="polite">
        {list.length} {list.length === 1 ? "theme" : "themes"}
      </p>

      {list.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <li key={t.key} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
              {/* Fixed frame so every card in a row lines up whatever the theme's image ratio. */}
              <Link
                href={`/dashboard/themes/${t.key}`}
                tabIndex={-1}
                aria-hidden
                className="block aspect-[9/10] overflow-hidden border-b border-border transition hover:opacity-95"
                style={{ background: t.preset.tokens.colors.background }}
              >
                <ThemeCardPreview theme={t} />
              </Link>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      <Link href={`/dashboard/themes/${t.key}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </h2>
                    <p className="text-small text-muted">{t.tagline}</p>
                  </div>
                  {t.status === "live" ? (
                    <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-caption font-medium text-success">Current theme</span>
                  ) : t.status === "draft" ? (
                    <span className="shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-caption font-medium text-info">In draft</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-caption">
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5">{t.industryLabel}</span>
                  <span className="rounded-full border border-border px-2 py-0.5">{THEME_STYLE_LABELS[t.style]}</span>
                  <Link href={`/dashboard/themes/${t.key}`} aria-label={`${t.name} details`} className="ml-auto text-small text-accent hover:underline">
                    Details
                  </Link>
                </div>
                <p className="text-caption text-muted">Best for {t.bestFor.join(" · ")}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {t.previewUrl ? (
                    <button type="button" onClick={() => setPreview(t)} aria-label={`Live preview of ${t.name}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-small hover:bg-surface-secondary">
                      <Eye className="size-3.5" aria-hidden /> Live preview
                    </button>
                  ) : null}
                  {enabled && t.status !== "live" ? <ApplyThemeButton themeKey={t.key} name={t.name} canPublish={canPublish} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-small text-muted">
          No themes match. {industry ? "More industries are being added." : "Try another search."}
        </div>
      )}

      {preview?.previewUrl ? (
        <ThemePreviewDialog
          name={preview.name}
          url={preview.previewUrl}
          onClose={() => setPreview(null)}
          actions={enabled && preview.status !== "live" ? <ApplyThemeButton themeKey={preview.key} name={preview.name} canPublish={canPublish} /> : null}
        />
      ) : null}
    </div>
  );
}
