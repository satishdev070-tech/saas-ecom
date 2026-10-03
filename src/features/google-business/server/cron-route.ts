import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/features/domains/cron-auth";
import { syncAllReviews } from "./reviews";

/**
 * Cron handler (suggested every 6 h, Bearer CRON_SECRET): refreshes cached Google reviews for up to
 * 25 connected stores per run, least recently synced first. Mounted at
 * src/app/api/cron/gbp-reviews/route.ts with `export { GET } from "@/features/google-business/server/cron-route";`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncAllReviews());
}
