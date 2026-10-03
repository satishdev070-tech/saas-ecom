import { NextResponse, type NextRequest } from "next/server";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { platformOrigin } from "@/lib/platform/urls";
import { PLATFORM_NAME } from "@/config/platform";
import { getPublicPlatformConfig } from "@/features/platform/server/public-config";
import { mapNominatimAddress, nominatimReverseUrl, parseCoordinates } from "@/features/geo/reverse";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

/**
 * GET /api/geo/reverse?lat=..&lon=.. → { ok, address: { line2, city, state, postalCode } }.
 * Backs the "Use my location" button on checkout and account address forms. Coordinates are
 * rounded, forwarded once to OpenStreetMap Nominatim (usage policy: identified User-Agent, at
 * most ~1 request/second, attribution shown next to the button) and never stored or logged.
 */
export async function GET(request: NextRequest) {
  if (!(await getPublicPlatformConfig()).locationAutofill) return fail("disabled", 404);
  const coords = parseCoordinates(request.nextUrl.searchParams.get("lat"), request.nextUrl.searchParams.get("lon"));
  if (!coords) return fail("invalid_coordinates", 400);
  try {
    await rateLimit("geo-reverse:ip", await clientIpKey(), 10, 600);
    await rateLimit("geo-reverse:all", "nominatim", 50, 60);
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") return fail("rate_limited", 429);
    throw err;
  }
  try {
    const res = await fetch(nominatimReverseUrl(coords.lat, coords.lon), {
      headers: { "User-Agent": `${PLATFORM_NAME.replace(/\s+/g, "")}/1.0 (+${platformOrigin()})`, Referer: platformOrigin(), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      logger.warn("geo.reverse_failed", { status: res.status });
      return fail("lookup_failed", 502);
    }
    const mapped = mapNominatimAddress(await res.json());
    if (!mapped.ok) return fail(mapped.reason, 422);
    return NextResponse.json({ ok: true, address: mapped.address }, { headers: NO_STORE });
  } catch {
    return fail("lookup_failed", 502);
  }
}
