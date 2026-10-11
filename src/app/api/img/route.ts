import { NextResponse, type NextRequest } from "next/server";
import { assetUrl } from "@/lib/storage/assets";
import { isVariantable, pickVariantWidth } from "@/lib/storage/variants";
import { ensureVariant } from "@/lib/storage/variants-server";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

/**
 * GET /api/img?p=tenant/{id}/…/{file}.jpg&w=960 → 308 to the pre-sized WebP copy in Supabase
 * Storage (creating it once from the original if needed). The redirect is cached by browsers and
 * the CDN for a year (paths are immutable), so this runs about once per image size, and the image
 * bytes come straight from Supabase, not through Vercel Image Optimization.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams.get("p") ?? "";
  const w = Number(request.nextUrl.searchParams.get("w"));
  if (!isVariantable(p) || !Number.isFinite(w) || w <= 0) return new NextResponse("Not found", { status: 404 });
  const width = pickVariantWidth(w);
  const original = assetUrl(p);
  if (!original) return new NextResponse("Not found", { status: 404 });

  let url: string | null = null;
  try {
    // Only misses do work; cap how many a single client can trigger.
    await rateLimit("img-variant:ip", await clientIpKey(), 600, 600);
    url = await ensureVariant(p, width);
  } catch (err) {
    if (!(err instanceof AppError && err.code === "RATE_LIMITED")) throw err;
  }
  if (!url) {
    // Fall back to the original for now (not cached long, so the next visit retries the variant).
    return NextResponse.redirect(original, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
  }
  return NextResponse.redirect(url, {
    status: 308,
    headers: { "Cache-Control": "public, max-age=31536000, immutable", "CDN-Cache-Control": "public, max-age=31536000, immutable" },
  });
}
