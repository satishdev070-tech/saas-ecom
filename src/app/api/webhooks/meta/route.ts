import type { NextRequest } from "next/server";
import { handleEvent, handleVerification } from "@/features/inbox/server/webhook-handler";

/**
 * Meta webhook for the unified inbox: Messenger (object "page") and Instagram DMs (object
 * "instagram"). Configure in the Meta app dashboard as https://{platform host}/api/webhooks/meta
 * with the verify token from the super admin console. POSTs are verified with X-Hub-Signature-256.
 */
export async function GET(request: NextRequest) {
  return handleVerification(request.nextUrl);
}

export async function POST(request: NextRequest) {
  return handleEvent(request, "meta");
}
