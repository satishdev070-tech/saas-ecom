/**
 * Pre-sized WebP copies ("variants") of tenant images, stored next to the original in the
 * store-assets bucket: tenant/{id}/products/{uuid}.jpg → tenant/{id}/products/{uuid}__w960.webp.
 * Store images are served from these copies (lib/images/loader.ts → /api/img) instead of Vercel
 * Image Optimization, whose per-transformation quota paused the platform. PURE (edge/client safe).
 */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

const TENANT_PATH = /^tenant\/[0-9a-f-]{36}\/[A-Za-z0-9._\-/]+$/;
const RASTER = /\.(jpe?g|png|webp|avif)$/i;
const VARIANT = /__w\d+\.webp$/;

/** True for an original raster image path we may make variants of (SVG/GIF/video are served as-is). */
export function isVariantable(path: string): boolean {
  return TENANT_PATH.test(path) && !path.includes("..") && RASTER.test(path) && !VARIANT.test(path);
}

/** The smallest variant at least as wide as `requested` (the largest one beyond that). */
export function pickVariantWidth(requested: number): VariantWidth {
  return VARIANT_WIDTHS.find((w) => w >= requested) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]!;
}

export function variantPath(path: string, width: VariantWidth): string {
  return `${path.replace(RASTER, "")}__w${width}.webp`;
}

/** All variant paths of an original (for deleting them with it). */
export function variantPathsFor(path: string): string[] {
  return isVariantable(path) ? VARIANT_WIDTHS.map((w) => variantPath(path, w)) : [];
}

/** Bucket-relative path of a Supabase public store-assets URL, or null. */
export function storeAssetPathFromUrl(src: string): string | null {
  const m = /\/storage\/v1\/object\/public\/store-assets\/(tenant\/[^?#]+)$/.exec(src);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
}
