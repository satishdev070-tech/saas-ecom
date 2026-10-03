import { ImageResponse } from "next/og";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import { OG_IMAGE_SIZE } from "@/features/marketing-site/seo";
import { shareImageUrl } from "@/features/platform/server/public-config";

export const revalidate = 3600;

/**
 * Social preview image for every marketing page (og:image / X card). Serves the image uploaded in
 * Admin → Branding & analytics when there is one; otherwise draws the default card below.
 * Colours mirror the .theme-brand tokens in globals.css.
 */
export async function GET() {
  const uploaded = await shareImageUrl();
  if (uploaded) {
    try {
      const res = await fetch(uploaded, { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && /^image\/(png|jpeg|webp)$/.test(type)) {
        return new Response(await res.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
      }
    } catch {
      // Fall through to the generated card.
    }
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#ffffff", color: "#0b1b3f" }}>
        <div style={{ display: "flex", width: 96, height: 10, borderRadius: 999, background: "#f5a524" }} />
        <div style={{ fontSize: 30, marginTop: 36, color: "#4338ca", fontWeight: 600 }}>{PLATFORM_TAGLINE}</div>
        <div style={{ fontSize: 104, fontWeight: 700, marginTop: 12, letterSpacing: -3 }}>{PLATFORM_NAME}</div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#4b5568" }}>Your brand. Your store. Your next big beginning.</div>
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
