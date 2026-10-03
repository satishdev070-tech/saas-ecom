import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import type { BrandImageView } from "../server/public-config";

/* eslint-disable @next/next/no-img-element -- previews show the uploaded files exactly as served */

function Wordmark({ light = false }: { light?: boolean }) {
  return <span className={`font-brand text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-[#0b1b3f]"}`}>{PLATFORM_NAME}</span>;
}

/**
 * How the uploaded files look where they are used: site header (logo on the left), dark footer,
 * the browser tab and a link preview (WhatsApp / Facebook / LinkedIn / X style card).
 */
export function BrandingPreview({ header, footer, favicon, share, siteHost, description }: { header: BrandImageView | null; footer: BrandImageView | null; favicon: BrandImageView | null; share: BrandImageView | null; siteHost: string; description: string }) {
  const footerLogo = footer ?? header;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="text-small font-medium">Browser tab</p>
        <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-border bg-surface-secondary px-3 pt-2">
          <div className="flex max-w-xs items-center gap-2 rounded-t-md border border-b-0 border-border bg-white px-3 py-1.5 text-caption text-[#0f172a]">
            {favicon ? <img src={favicon.src} alt="" className="size-4 object-contain" /> : <span className="size-4 rounded-sm bg-[#4338ca]" aria-hidden />}
            <span className="truncate">
              {PLATFORM_NAME} — {PLATFORM_TAGLINE}
            </span>
          </div>
        </div>
        <p className="pt-2 text-small font-medium">Website header</p>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            {header ? <img src={header.src} alt={PLATFORM_NAME} className="h-8 w-auto max-w-[180px] object-contain" /> : <Wordmark />}
            <div className="hidden items-center gap-4 text-caption text-[#0b1b3f]/80 sm:flex">
              <span>Features</span>
              <span>Themes</span>
              <span>Pricing</span>
              <span className="rounded-full bg-[#4338ca] px-3 py-1.5 font-semibold text-white">Create Your Store</span>
            </div>
          </div>
        </div>
        <p className="pt-2 text-small font-medium">Website footer</p>
        <div className="rounded-lg bg-[#0b1b3f] px-4 py-5">
          {footerLogo ? <img src={footerLogo.src} alt={PLATFORM_NAME} className="h-8 w-auto max-w-[180px] object-contain" /> : <Wordmark light />}
          <p className="mt-2 text-caption text-white/70">{PLATFORM_TAGLINE}.</p>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-small font-medium">Link preview when the site is shared</p>
        <div className="max-w-md overflow-hidden rounded-lg border border-border bg-white text-[#0f172a]">
          <img src={share?.src ?? "/og"} alt="" className="aspect-[1200/630] w-full bg-surface-secondary object-cover" />
          <div className="space-y-0.5 border-t border-border px-3 py-2.5">
            <p className="text-caption uppercase text-[#64748b]">{siteHost}</p>
            <p className="text-small font-semibold">
              {PLATFORM_NAME} — {PLATFORM_TAGLINE}
            </p>
            <p className="line-clamp-2 text-caption text-[#475569]">{description}</p>
          </div>
        </div>
        <p className="text-caption text-muted">
          {share ? "Using your uploaded share image." : "No share image uploaded: the generated default card is used."} Social apps cache previews; use Facebook&apos;s Sharing Debugger or LinkedIn&apos;s Post Inspector to refresh them after a change.
        </p>
      </div>
    </div>
  );
}
