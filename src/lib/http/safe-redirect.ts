/**
 * Guards against open redirects. Only same-origin relative paths are allowed as
 * user-supplied redirect targets (e.g. `?next=` after login).
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/"): string {
  if (!target || typeof target !== "string") return fallback;
  const value = target.trim();
  if (value.length === 0 || value.length > 2048) return fallback;
  // Must be an absolute path on this origin.
  if (!value.startsWith("/")) return fallback;
  // Protocol-relative (//evil.com) and backslash tricks (/\evil.com) that browsers treat as hosts.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters (tab/newline are stripped by URL parsers and can smuggle hosts).
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = "https://placeholder.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
