import { NextResponse, type NextRequest } from "next/server";
import { getRequestHost } from "@/lib/tenant/resolve";
import { handleRazorpayWebhook } from "@/features/payments/webhook-handler";

/**
 * Razorpay webhook, configured per store as https://{store host}/api/webhooks/razorpay.
 * The raw body is verified against that tenant's webhook secret before anything is trusted.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 256 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const res = await handleRazorpayWebhook({
    host: await getRequestHost(),
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventIdHeader: request.headers.get("x-razorpay-event-id"),
  });
  return NextResponse.json(res.body, { status: res.status });
}
