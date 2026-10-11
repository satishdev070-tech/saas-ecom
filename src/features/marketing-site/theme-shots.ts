import manifest from "./theme-previews.json";

/**
 * Pre-captured screenshots of each theme on its demo store (scripts/themes/capture-previews.mts),
 * served from /public as plain static files: no Vercel Image Optimization and no live demo store
 * loaded per visitor. Themes without a screenshot fall back to the token mockup. PURE.
 */
export type ShotDevice = "desktop" | "phone";

const captured: Record<ShotDevice, ReadonlySet<string>> = {
  desktop: new Set(manifest.desktop as string[]),
  phone: new Set(manifest.phone as string[]),
};

export function themeShot(key: string, device: ShotDevice): string | null {
  return captured[device].has(key) ? `/theme-previews/${key}-${device}.webp` : null;
}
