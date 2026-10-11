import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
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
