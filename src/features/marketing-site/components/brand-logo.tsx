import Link from "next/link";
import { PLATFORM_LOGO, PLATFORM_NAME } from "@/config/platform";
import { cn } from "@/lib/cn";
import { brandImageView, getPublicPlatformConfig } from "@/features/platform/server/public-config";

/**
 * The Build Brighten logo, linking home. Uses the logo uploaded in the platform console
 * (/admin/branding; the footer logo on dark backgrounds, falling back to the header logo), then
 * PLATFORM_LOGO, then a plain text wordmark.
 */
const IMG_SIZE = {
  // Site header: 40px tall on phones, 48px from sm up (header is 72/80px).
  header: "h-10 max-w-[140px] sm:h-12 sm:max-w-[280px]",
  // Dark footer and compact placements (sign-in, onboarding).
  compact: "h-10 max-w-[220px]",
} as const;

export async function BrandLogo({ className, tone = "dark", size = "compact" }: { className?: string; tone?: "dark" | "light"; size?: keyof typeof IMG_SIZE }) {
  const config = await getPublicPlatformConfig();
  const uploaded = brandImageView(tone === "light" ? (config.footerLogo ?? config.headerLogo) : config.headerLogo);
  const logo = uploaded ?? PLATFORM_LOGO;
  return (
    <Link href="/" className={cn("inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand", className)} aria-label={`${PLATFORM_NAME} home`}>
      {logo ? (
        // Plain <img>: the file is already sized for display; width/height reserve space (no layout shift).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} width={logo.width ?? undefined} height={logo.height ?? undefined} alt={PLATFORM_NAME} className={cn("w-auto object-contain object-left", IMG_SIZE[size])} />
      ) : (
        <span className={cn("font-brand font-extrabold tracking-tight", size === "header" ? "text-xl sm:text-2xl" : "text-xl", tone === "dark" ? "text-brand-ink" : "text-white")}>{PLATFORM_NAME}</span>
      )}
    </Link>
  );
}
