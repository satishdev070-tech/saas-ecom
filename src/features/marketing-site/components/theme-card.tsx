import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import { THEME_STYLE_LABELS, type MarketplaceTheme } from "@/features/theme/marketplace/types";
import { industryShort } from "@/features/stores/industries";
import { analyticsAttributes } from "../analytics";
import { buttonClass } from "./ui";

/** Short display name for the theme's mock store header ("Heritage Kashmir" -> "Heritage"). */
const mockName = (t: MarketplaceTheme) => t.name.split(" ")[0]!;

/** Desktop browser frame + phone frame, both drawn from the theme's own tokens. */
export function ThemeDevicePreview({ theme, size = "card" }: { theme: MarketplaceTheme; size?: "card" | "large" }) {
  return (
    <div className="relative" aria-hidden>
      <div className="overflow-hidden rounded-brand-md border border-border bg-white shadow-brand-card">
        <div className="flex items-center gap-1.5 border-b border-border bg-brand-canvas px-3 py-2">
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
        </div>
        <ThemeMockup preset={theme.preset} name={mockName(theme)} size={size === "large" ? "large" : "card"} />
      </div>
      <div className={size === "large" ? "absolute -bottom-6 right-4 w-[26%] min-w-28" : "absolute -bottom-4 right-3 w-[30%]"}>
        <div className="overflow-hidden rounded-[18px] border-[5px] border-brand-ink bg-white shadow-brand-float">
          <ThemeMockup preset={theme.preset} name={mockName(theme)} size="phone" />
        </div>
      </div>
    </div>
  );
}

export function ThemeCard({ theme, previewUrl, headingLevel = "h3", location }: { theme: MarketplaceTheme; previewUrl: string | null; headingLevel?: "h2" | "h3"; location: string }) {
  const H = headingLevel;
  return (
    <article className="group flex h-full flex-col rounded-brand-lg border border-border bg-white p-4 transition-shadow hover:shadow-brand-card">
      <Link href={`/themes/${theme.key}`} className="block rounded-brand-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" tabIndex={-1} aria-hidden>
        <div className="pb-5">
          <ThemeDevicePreview theme={theme} />
        </div>
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">{industryShort(theme.industry)}</span>
          <span className="rounded-full bg-brand-canvas px-2.5 py-1 text-muted">{THEME_STYLE_LABELS[theme.style]}</span>
        </div>
        <H className="mt-3 font-brand text-lg font-bold text-brand-ink">
          <Link href={`/themes/${theme.key}`} className="hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
            {theme.name}
          </Link>
        </H>
        <p className="mt-1 text-sm text-muted">{theme.tagline}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")} {...analyticsAttributes("theme_preview", theme.key, location)}>
              Preview Theme <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(opens a demo store in a new tab)</span>
            </a>
          ) : (
            <Link href={`/themes/${theme.key}`} className={buttonClass("secondary", "sm")} {...analyticsAttributes("theme_preview", theme.key, location)}>
              Preview Theme
            </Link>
          )}
          <Link href={`/themes/${theme.key}/use`} prefetch={false} className={buttonClass("primary", "sm")} {...analyticsAttributes("cta_click", `use_${theme.key}`, location)}>
            Use This Theme
          </Link>
        </div>
      </div>
    </article>
  );
}
