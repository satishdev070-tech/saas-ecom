import { ImageResponse } from "next/og";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import { OG_IMAGE_SIZE } from "@/features/marketing-site/seo";

export const revalidate = 86400;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#fbf8f3", color: "#1f1a17" }}>
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#a4452b" }}>{PLATFORM_TAGLINE}</div>
        <div style={{ fontSize: 110, fontFamily: "serif", marginTop: 20 }}>{PLATFORM_NAME}</div>
        <div style={{ fontSize: 38, marginTop: 24, color: "#5b524b" }}>Your Fashion Brand. Your Store. Your Growth Engine.</div>
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
