/**
 * Baseline security headers applied to every response via next.config.ts.
 * CSP is intentionally deferred to the hardening phase (needs nonce support for
 * Next inline scripts and the payment provider's checkout script). See DECISIONS.md.
 */
export const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/**
 * Framing policy, set per request by the proxy (ADR-018). Storefront responses may be framed
 * by the platform origin (theme editor live preview); everything else only by itself.
 * `frame-ancestors` supersedes X-Frame-Options in modern browsers; XFO stays for old ones
 * where it can express the policy (it can't list another origin, so storefronts omit it).
 */
export function framingHeaders(kind: "store" | "platform", platformOrigin: string): Record<string, string> {
  if (kind === "store") {
    let origin = "";
    try {
      origin = new URL(platformOrigin).origin;
    } catch {
      origin = "";
    }
    return { "Content-Security-Policy": `frame-ancestors 'self'${origin ? ` ${origin}` : ""}` };
  }
  return { "Content-Security-Policy": "frame-ancestors 'self'", "X-Frame-Options": "SAMEORIGIN" };
}
