import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { assetUrl } from "@/lib/storage/assets";
import { logger } from "@/lib/observability/logger";
import { storeImageSrc } from "@/features/storefront/components/store-image";

/**
 * Header logo as an optimised image (AVIF/WebP, at most 640px wide) instead of the uploaded
 * original, which can be a multi-MB PNG that React preloads on every page.
 *
 * The optimizer rounds the resized height to whole pixels, which would change the logo's aspect
 * ratio very slightly (a sub-pixel shift of everything below the header). So we also return the
 * ORIGINAL aspect ratio, which the <img> sets via CSS `aspect-ratio`, and the box renders at the
 * exact same size as before. Dimensions are read once per file path (uploads get new paths) and
 * cached across requests. If they can't be read, the original file is used as before.
 */
const originalSize = unstable_cache(
  async (src: string): Promise<{ width: number; height: number } | null> => {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return null;
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  },
  ["sf", "logo-size"],
  { revalidate: 60 * 60 * 24 * 7 },
);

export type StoreLogo = { src: string; aspectRatio?: string };

export const getStoreLogo = cache(async (path: string | null | undefined): Promise<StoreLogo | null> => {
  const original = assetUrl(path);
  if (!original) return null;
  const optimised = storeImageSrc(path);
  if (!optimised || optimised === original) return { src: original };
  try {
    const size = await originalSize(original);
    // Small files (<= 640px wide) aren't resized, so their ratio is already exact.
    if (size && size.width > 640) return { src: optimised, aspectRatio: `${size.width} / ${size.height}` };
    if (size) return { src: optimised };
  } catch (e) {
    logger.warn("storefront.logo_size_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  return { src: original };
});
