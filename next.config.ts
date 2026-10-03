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
    formats: ["image/avif", "image/webp"],
    // Next's default minus 3840: storefronts top out around 100vw x 2 DPR (~2048), and every width
    // adds a ~250-char candidate to each <img srcset> in the HTML (the bulk of a storefront page).
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
