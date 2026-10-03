import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/features/domains/cron-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/** Cron (every 5 min): cancel unpaid online orders whose stock reservation expired. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await createSupabaseAdminClient().rpc("svc_expire_unpaid_orders");
  if (error) {
    logger.error("cron.expire_orders_failed", { error: error.message });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ expired: data ?? 0 });
}
