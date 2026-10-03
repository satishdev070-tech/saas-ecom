import { ImageResponse } from "next/og";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import { OG_IMAGE_SIZE } from "@/features/marketing-site/seo";

export const revalidate = 86400;

/** Social preview image. Colours mirror the .theme-brand tokens in globals.css. */
export function GET() {
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
