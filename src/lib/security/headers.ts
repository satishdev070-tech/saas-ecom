/**
 * Baseline security headers applied to every response via next.config.ts.
 * CSP is intentionally deferred to the hardening phase (needs nonce support for
 * Next inline scripts and the payment provider's checkout script). See DECISIONS.md.
 */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/**
 * Framing policy, set per request by the proxy (ADR-018). Storefront responses may be framed
 * by the platform origin (theme editor live preview); everything else only by itself.
 * `frame-ancestors` supersedes X-Frame-Options in modern browsers; XFO stays for old ones
 * where it can express the policy (it can't list another origin, so storefronts omit it).
 */
export function framingHeaders(kind: "store" | "platform", platformOrigins: string | readonly string[]): Record<string, string> {
  if (kind === "store") {
    const origins = new Set<string>();
    for (const value of typeof platformOrigins === "string" ? [platformOrigins] : platformOrigins) {
      try {
        const url = new URL(value);
        if (url.protocol === "https:" || url.protocol === "http:") origins.add(url.origin);
      } catch {
        // Not a URL: never widen the policy with it.
      }
    }
    return { "Content-Security-Policy": `frame-ancestors 'self'${[...origins].map((o) => ` ${o}`).join("")}` };
  }
  return { "Content-Security-Policy": "frame-ancestors 'self'", "X-Frame-Options": "SAMEORIGIN" };
}

/**
 * Every exact origin that serves the platform app (and so may frame storefront previews): the
 * configured platform URL, the root domain and its www host, plus the exact aliases from
 * lib/platform/hosts. Never a wildcard.
 */
export function platformFrameOrigins(platformOrigin: string, rootDomain: string, aliases: readonly string[]): string[] {
  const out = [platformOrigin];
  if (rootDomain && rootDomain !== "localhost") out.push(`https://${rootDomain}`, `https://www.${rootDomain}`);
  for (const host of aliases) out.push(`https://${host}`);
  return out;
}
