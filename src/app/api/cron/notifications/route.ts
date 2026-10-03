import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/features/domains/cron-auth";
import { logger } from "@/lib/observability/logger";
import { dispatch } from "@/features/notifications/events";
import { emitAbandonedCarts } from "@/features/notifications/email/abandoned";
import { processDueJobs } from "@/features/notifications/whatsapp/queue";
import { findWhatsAppAbandonedCarts } from "@/features/notifications/whatsapp/abandoned";

/**
 * Cron (every 5–15 min, Authorization: Bearer CRON_SECRET):
 * 1. retries due WhatsApp notification jobs (backoff, max attempts),
 * 2. emits cart.abandoned for idle carts (email-enabled stores via role C's helper, and
 *    WhatsApp-enabled stores here). Idempotency keys make repeated runs send at most once.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const out: Record<string, unknown> = {};
  try {
    out.jobs = await processDueJobs(25);
  } catch (err) {
    logger.error("cron.notifications_jobs_failed", { error: err });
    out.jobs = "failed";
  }
  try {
    out.abandonedEmail = await emitAbandonedCarts(100);
    const carts = await findWhatsAppAbandonedCarts(50);
    let sent = 0;
    for (const c of carts) {
      const r = await dispatch({ type: "cart.abandoned", tenantId: c.tenantId, cartId: c.cartId });
      if (r.whatsapp?.status === "sent") sent++;
    }
    out.abandonedWhatsApp = { candidates: carts.length, sent };
  } catch (err) {
    logger.error("cron.notifications_abandoned_failed", { error: err });
    out.abandoned = "failed";
  }
  return NextResponse.json(out);
}
