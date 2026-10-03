import Image from "next/image";
import Link from "next/link";
import { PLATFORM_LOGO, PLATFORM_NAME } from "@/config/platform";
import { cn } from "@/lib/cn";

/**
 * The Build Brighten logo, linking home. Renders the official logo file when PLATFORM_LOGO is
 * configured; until then a plain text wordmark (not a redesigned logo) stands in.
 */
export function BrandLogo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <Link href="/" className={cn("inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand", className)} aria-label={`${PLATFORM_NAME} home`}>
      {PLATFORM_LOGO ? (
        <Image src={PLATFORM_LOGO.src} width={PLATFORM_LOGO.width} height={PLATFORM_LOGO.height} alt={PLATFORM_NAME} priority className="h-8 w-auto" />
      ) : (
        <span className={cn("font-brand text-xl font-extrabold tracking-tight", tone === "dark" ? "text-brand-ink" : "text-white")}>{PLATFORM_NAME}</span>
      )}
    </Link>
  );
}
