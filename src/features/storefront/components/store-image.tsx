import Image from "next/image";
import { assetUrl } from "@/lib/storage/assets";

const optimizerUrl = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

/**
 * Tenant image from Supabase Storage via next/image. Renders a neutral placeholder when the
 * path is empty/invalid (assetUrl only accepts tenant/{uuid}/... paths).
 */
export function StoreImage({
  path,
  alt,
  sizes,
  priority = false,
  className = "",
  natural = false,
}: {
  path: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Full width, height from the image's own proportions (never cropped). Used by banner slides. */
  natural?: boolean;
}) {
  const src = assetUrl(path);
  if (!src) {
    return <div aria-hidden className={`absolute inset-0 bg-[color-mix(in_srgb,var(--sf-border)_60%,var(--sf-surface))] ${className}`} />;
  }
  // `priority` = the LCP candidate (eager, high fetch priority, preloaded); everything else lazy-loads.
  // Kept on the deprecated `priority` prop on purpose: `preload` emits a different preload hint, and
  // the browser then reuses a different candidate width (measurable pixel change on live stores).
  if (natural) return <Image src={src} alt={alt} width={0} height={0} sizes={sizes} priority={priority} className={`block h-auto w-full ${className}`} />;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`object-cover ${className}`} />;
}

/**
 * Optimised URL (AVIF/WebP via the Next image optimizer) for a tenant image rendered with a plain
 * <img> whose size comes from the file itself, e.g. the header logo (`h-auto w-auto` + max caps).
 * The optimizer only ever shrinks, so the image keeps its natural size up to `width` px; a CSS cap
 * at or below `width` renders it at the original's size, except that the resized height is rounded
 * to whole pixels (pass the original ratio as CSS aspect-ratio for an exact match, as
 * features/storefront/server/logo.ts does for the header logo).
 * `width` must be one of next.config images.deviceSizes/imageSizes. Null for invalid paths.
 */
export function storeImageSrc(path: string | null | undefined, width: 384 | 640 | 828 = 640): string | null {
  const src = assetUrl(path);
  // The optimizer refuses SVG (vector anyway) and passes GIF through: use those as they are.
  if (!src || /\.(svg|gif)$/i.test(src)) return src;
  return optimizerUrl(src, width);
}
