import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/features/domains/cron-auth";
import { runDomainMaintenance } from "@/features/domains/server/service";

/** Cron (every 15 min): re-check pending custom domains and SSL status. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDomainMaintenance());
}
