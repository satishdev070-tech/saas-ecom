import type { NextRequest } from "next/server";
import { handleEvent, handleVerification } from "@/features/inbox/server/webhook-handler";

/**
 * WhatsApp Cloud API webhook (object "whatsapp_business_account"): inbound messages and delivery
 * statuses. Configure under WhatsApp → Configuration in the Meta app as
 * https://{platform host}/api/webhooks/whatsapp, subscribed to the "messages" field.
 */
export async function GET(request: NextRequest) {
  return handleVerification(request.nextUrl);
}

export async function POST(request: NextRequest) {
  return handleEvent(request, "whatsapp");
}
