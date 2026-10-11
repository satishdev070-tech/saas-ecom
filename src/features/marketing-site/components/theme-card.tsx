import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import { THEME_STYLE_LABELS, type MarketplaceTheme } from "@/features/theme/marketplace/types";
import { industryShort } from "@/features/stores/industries";
import { analyticsAttributes } from "../analytics";
import { buttonClass } from "./ui";
import { DESKTOP_VIEWPORT, LiveFrame, PHONE_VIEWPORT } from "./live-frame";
import { ClickToLive } from "./click-to-live";
import { themeShot, type ShotDevice } from "../theme-shots";
import type { ReactNode } from "react";

/** Short display name for the theme's mock store header ("Heritage Kashmir" -> "Heritage"). */
const mockName = (t: MarketplaceTheme) => t.name.split(" ")[0]!;

/** A theme screenshot (static file) or, when none was captured, the token mockup. */
function Still({ theme, device, size, eager }: { theme: MarketplaceTheme; device: ShotDevice; size: "card" | "large"; eager: boolean }) {
  const shot = themeShot(theme.key, device);
  const vp = device === "desktop" ? DESKTOP_VIEWPORT : PHONE_VIEWPORT;
  return (
    <div className="overflow-hidden" style={{ aspectRatio: `${vp.width} / ${vp.height}`, background: theme.preset.tokens.colors.background }}>
      {shot ? (
        // Plain <img> on purpose: a pre-sized static WebP needs no Image Optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot} alt="" width={vp.width} height={vp.height} loading={eager ? "eager" : "lazy"} decoding="async" className="block size-full object-cover object-top" />
      ) : (
        <ThemeMockup preset={theme.preset} name={mockName(theme)} size={device === "phone" ? "phone" : size === "large" ? "large" : "card"} />
      )}
    </div>
  );
}

function Devices({ desktop, phone, size }: { desktop: ReactNode; phone: ReactNode; size: "card" | "large" }) {
  return (
    <div className="relative" aria-hidden>
      <div className="overflow-hidden rounded-brand-md border border-border bg-white shadow-brand-card">
        <div className="flex items-center gap-1.5 border-b border-border bg-brand-canvas px-3 py-2">
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
          <span className="size-2 rounded-full bg-border-strong" />
        </div>
        {desktop}
      </div>
      <div className={size === "large" ? "absolute -bottom-8 right-3 w-[24%] min-w-24 sm:right-5" : "absolute -bottom-5 right-2 w-[24%]"}>
        <div className={`overflow-hidden border-brand-ink bg-brand-ink shadow-brand-float ${size === "large" ? "rounded-[22px] border-[6px]" : "rounded-[14px] border-4"}`}>{phone}</div>
      </div>
    </div>
  );
}

/**
 * Desktop browser frame + phone frame showing the theme: a pre-captured screenshot (or the token
 * mockup). With `live` and a demo URL, a "Live preview" button swaps in the real demo store at true
 * device widths (1280px desktop, 390x844 phone), loaded only on request.
 */
export function ThemeDevicePreview({ theme, previewUrl = null, size = "card", eager = false, live = false }: { theme: MarketplaceTheme; previewUrl?: string | null; size?: "card" | "large"; eager?: boolean; live?: boolean }) {
  const still = <Devices size={size} desktop={<Still theme={theme} device="desktop" size={size} eager={eager} />} phone={<Still theme={theme} device="phone" size={size} eager={eager} />} />;
  if (!live || !previewUrl) return still;
  const liveView = (
    <Devices
      size={size}
      desktop={<LiveFrame src={previewUrl} viewport={DESKTOP_VIEWPORT} fallback={<Still theme={theme} device="desktop" size={size} eager />} eager />}
      phone={<LiveFrame src={previewUrl} viewport={PHONE_VIEWPORT} fallback={<Still theme={theme} device="phone" size={size} eager />} eager />}
    />
  );
  return <ClickToLive still={still} live={liveView} label="Live preview" />;
}

export function ThemeCard({ theme, previewUrl, headingLevel = "h3", location }: { theme: MarketplaceTheme; previewUrl: string | null; headingLevel?: "h2" | "h3"; location: string }) {
  const H = headingLevel;
  return (
    <article className="group flex h-full flex-col rounded-brand-lg border border-border bg-white p-4 transition-shadow hover:shadow-brand-card">
      <Link href={`/themes/${theme.key}`} className="block rounded-brand-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" tabIndex={-1} aria-hidden>
        <div className="pb-6">
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
