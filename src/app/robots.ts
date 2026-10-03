import type { MetadataRoute } from "next";
import { siteOrigin } from "@/features/marketing-site/site";

/** Platform robots.txt. Store hosts get their own (/store/[host]/robots.txt via the proxy). */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/onboarding", "/seller", "/login", "/signup", "/auth", "/invite", "/api", "/themes/*/use"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
