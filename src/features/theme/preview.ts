/**
 * Draft-theme preview tokens (pure half). The dashboard (seller with theme.edit) mints a
 * short-lived token bound to ONE tenant; the storefront's /preview route verifies it and
 * stores it in an httpOnly cookie; the storefront layout re-verifies it on every request
 * before rendering the DRAFT instead of the published theme. Signing lives in
 * ./server/preview.ts (needs APP_SECRET).
 */

export const PREVIEW_PURPOSE = "theme-preview";
export const PREVIEW_COOKIE = "sf_preview";
export const PREVIEW_TTL_SECONDS = 2 * 60 * 60;

export type PreviewClaims = { tenantId: string; userId: string; expiresAt: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodePreviewClaims(c: PreviewClaims): string {
  return JSON.stringify({ t: c.tenantId, u: c.userId, x: c.expiresAt });
}

/**
 * Parses a VERIFIED token payload and checks it is for `tenantId` and not expired.
 * Returns null for anything malformed, expired, too far in the future, or for another tenant.
 */
export function decodePreviewClaims(payload: string, tenantId: string, nowMs = Date.now()): PreviewClaims | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { t, u, x } = raw as Record<string, unknown>;
  if (typeof t !== "string" || typeof u !== "string" || typeof x !== "number" || !Number.isInteger(x)) return null;
  if (!UUID_RE.test(t) || !UUID_RE.test(u)) return null;
  if (t.toLowerCase() !== tenantId.toLowerCase()) return null;
  const now = Math.floor(nowMs / 1000);
  if (x <= now || x > now + PREVIEW_TTL_SECONDS + 60) return null;
  return { tenantId: t, userId: u, expiresAt: x };
}

/** Storefront URL that installs the preview cookie and lands on `path`. */
export function previewEntryUrl(storeOrigin: string, token: string, path = "/"): string {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `${storeOrigin}/preview?token=${encodeURIComponent(token)}&path=${encodeURIComponent(safePath)}`;
}
