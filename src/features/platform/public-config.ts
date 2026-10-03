/**
 * Public platform configuration (migration 2500): marketing-site logos and favicon, the GA4
 * measurement id and sign-in / checkout switches. Stored in `platform_settings` under the
 * `public.` prefix, which the anon role may read; only platform staff with
 * platform.settings.manage can write. PURE (no I/O), unit tested.
 */

export const PUBLIC_CONFIG_KEYS = {
  headerLogo: "public.brand.header_logo",
  footerLogo: "public.brand.footer_logo",
  favicon: "public.brand.favicon",
  ga4: "public.analytics.ga4_id",
  googleSellers: "public.auth.google_sellers",
  googleShoppers: "public.auth.google_shoppers",
  locationAutofill: "public.checkout.location_autofill",
} as const;

export const BRAND_SLOTS = ["header_logo", "footer_logo", "favicon"] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];

export const brandSlotKey = (slot: BrandSlot) => `public.brand.${slot}` as const;

export const BRANDING_BUCKET = "platform-branding";
export const MAX_BRAND_IMAGE_BYTES = 2 * 1024 * 1024;

export type BrandImage = { path: string; width: number | null; height: number | null };

export type PublicPlatformConfig = {
  headerLogo: BrandImage | null;
  footerLogo: BrandImage | null;
  favicon: BrandImage | null;
  ga4Id: string | null;
  /** "Continue with Google" for sellers (also needs the Google provider on in Supabase Auth). */
  googleForSellers: boolean;
  /** "Continue with Google" for store customers (same requirement). */
  googleForShoppers: boolean;
  /** "Use my current location" on checkout / address forms (platform-wide switch). */
  locationAutofill: boolean;
};

export const DEFAULT_PUBLIC_CONFIG: PublicPlatformConfig = {
  headerLogo: null,
  footerLogo: null,
  favicon: null,
  ga4Id: null,
  googleForSellers: true,
  googleForShoppers: true,
  locationAutofill: true,
};

/** GA4 web stream measurement id, e.g. G-AB12CD34EF. */
export const GA4_ID_RE = /^G-[A-Z0-9]{4,20}$/;

/** Only paths this feature writes are accepted back (no arbitrary URLs end up in <img>/<link>). */
const PATH_RE = /^branding\/(header_logo|footer_logo|favicon)\/[0-9a-f-]{36}\.(png|jpg|webp|ico)$/;

export function parseBrandImage(value: unknown): BrandImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.path !== "string" || !PATH_RE.test(v.path)) return null;
  const dim = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 10000 ? n : null);
  return { path: v.path, width: dim(v.width), height: dim(v.height) };
}

export function parseGa4Id(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return GA4_ID_RE.test(id) ? id : null;
}

/** Builds the config from `platform_settings` rows; unknown or malformed values fall back to the defaults. */
export function parsePublicConfig(rows: readonly { key: string; value: unknown }[]): PublicPlatformConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const bool = (key: string, fallback: boolean) => {
    const v = map.get(key);
    return typeof v === "boolean" ? v : fallback;
  };
  return {
    headerLogo: parseBrandImage(map.get(PUBLIC_CONFIG_KEYS.headerLogo)),
    footerLogo: parseBrandImage(map.get(PUBLIC_CONFIG_KEYS.footerLogo)),
    favicon: parseBrandImage(map.get(PUBLIC_CONFIG_KEYS.favicon)),
    ga4Id: parseGa4Id(map.get(PUBLIC_CONFIG_KEYS.ga4)),
    googleForSellers: bool(PUBLIC_CONFIG_KEYS.googleSellers, DEFAULT_PUBLIC_CONFIG.googleForSellers),
    googleForShoppers: bool(PUBLIC_CONFIG_KEYS.googleShoppers, DEFAULT_PUBLIC_CONFIG.googleForShoppers),
    locationAutofill: bool(PUBLIC_CONFIG_KEYS.locationAutofill, DEFAULT_PUBLIC_CONFIG.locationAutofill),
  };
}

/** Public URL of a file in the branding bucket. */
export function brandImageUrl(supabaseUrl: string, image: BrandImage): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BRANDING_BUCKET}/${image.path}`;
}

/** Magic-byte check for the favicon slot (.ico); other image types use lib/storage's sniffer. */
export function isIco(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && (bytes[4]! > 0 || bytes[5]! > 0);
}
