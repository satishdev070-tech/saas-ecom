/**
 * Live Preview of a marketplace theme on a demo (showcase) store. Pure and edge-safe: the proxy
 * imports it. `?sf_theme=<key>` on a store URL asks for the preview; the proxy forwards the key in
 * an internal header and remembers it in a cookie so in-store navigation keeps the theme.
 * `?sf_theme=exit` clears it. The theme is applied IN MEMORY at render time and only for showcase
 * tenants (see canPreviewThemes); nothing is ever written to the database.
 */
export const THEME_PREVIEW_PARAM = "sf_theme";
export const THEME_PREVIEW_COOKIE = "sf_theme_preview";
export const THEME_PREVIEW_EXIT = "exit";
export const THEME_PREVIEW_TTL_SECONDS = 2 * 60 * 60;
/** postMessage type the framed demo store sends when Escape is pressed (closes the dialog). */
export const THEME_PREVIEW_ESCAPE_MESSAGE = "sf-theme-preview:escape";

const KEY_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const isPreviewKeyShape = (v: string | null | undefined): v is string => !!v && v !== THEME_PREVIEW_EXIT && KEY_RE.test(v);

/** URL that opens `origin` (a demo store) rendered with theme `key`. */
export function livePreviewUrl(origin: string, key: string, path = "/"): string {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `${origin}${safePath}?${THEME_PREVIEW_PARAM}=${encodeURIComponent(key)}`;
}
