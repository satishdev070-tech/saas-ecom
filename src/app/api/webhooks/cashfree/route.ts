import { NextResponse, type NextRequest } from "next/server";
import { getRequestHost } from "@/lib/tenant/resolve";
import { handleCashfreeWebhook } from "@/features/payments/gateways";

/** Cashfree payment webhook for a store (notify_url = https://{store host}/api/webhooks/cashfree). */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const res = await handleCashfreeWebhook({
    host: await getRequestHost(),
    rawBody,
    timestamp: request.headers.get("x-webhook-timestamp"),
    signature: request.headers.get("x-webhook-signature"),
  });
  return NextResponse.json(res.body, { status: res.status });
}
