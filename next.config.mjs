// Plain JavaScript (not next.config.ts) on purpose: hosts whose build servers can't run Next's
// native compiler (old glibc, e.g. Hostinger) fall back to the WebAssembly compiler, which can't
// load a TypeScript config. Keep this file free of TypeScript imports.

/**
 * Baseline security headers applied to every response.
 * CSP is intentionally deferred to the hardening phase (needs nonce support for Next inline
 * scripts and the payment provider's checkout script). See docs/DECISIONS.md. Framing headers are
 * set per request by the proxy (src/lib/security/headers.ts, ADR-018).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;
  } catch {
    return undefined;
  }
})();

/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Image uploads go through Server Actions (1 MB default) and proxy.ts (10 MB default buffer).
    // Each image is capped at 10 MB in lib/storage/upload.ts; allow a few per request.
    serverActions: { bodySizeLimit: "25mb" },
    proxyClientMaxBodySize: "25mb",
  },
  images: {
    // Product/store images are served from Supabase Storage public buckets only.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    // Every (image × width × format) the optimizer produces counts against Vercel's Image
    // Optimization "transformations" quota (the Hobby plan was paused for exceeding it), so:
    // WebP only (AVIF doubled the count for a small size gain) and a short width ladder
    // (each width is another transformation per image; the browser picks the next size up).
    // Store images don't use Vercel Image Optimization at all: the custom loader serves pre-sized
    // WebP copies from Supabase Storage (see src/lib/images/loader.ts, /api/img). The settings
    // below still decide which widths go into each <img srcset>.
    loader: "custom",
    loaderFile: "./src/lib/images/loader.ts",
    formats: ["image/webp"],
    deviceSizes: [640, 1080, 1920],
    // Small slots (thumbnails, cards in narrow grids) and the 384px logo (storeImageSrc).
    imageSizes: [96, 384],
    // Optimized images are immutable per URL (uploads get new paths), so keep them for 31 days
    // instead of re-optimizing whenever a short upstream cache expires.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
