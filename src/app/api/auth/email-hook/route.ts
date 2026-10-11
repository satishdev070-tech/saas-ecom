import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/observability/logger";
import { verifyStandardWebhook } from "@/lib/email/standard-webhook";
import { handleAuthEmailHook, parseAuthHookPayload } from "@/features/notifications/email/auth-hook";

/**
 * Supabase Auth "Send Email" hook (Authentication → Hooks → Send Email → HTTPS:
 * https://{platform}/api/auth/email-hook). Signed with SEND_EMAIL_HOOK_SECRET (Standard Webhooks).
 * Responds {} on success, or { error: { http_code, message } } as Supabase expects.
 */
export const dynamic = "force-dynamic";

function fail(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: NextRequest) {
  const secret = serverEnv().SEND_EMAIL_HOOK_SECRET;
  if (!secret) return fail(503, "Send Email hook is not configured on this server");
  const body = await request.text();
  if (body.length > 64 * 1024) return fail(413, "Payload too large");
  const ok = verifyStandardWebhook({
    secret,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body,
  });
  if (!ok) return fail(401, "Invalid signature");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(400, "Invalid JSON");
  }
  const payload = parseAuthHookPayload(json);
  if (!payload) return fail(400, "Unexpected payload");
  try {
    const res = await handleAuthEmailHook(payload);
    if (!res.ok) return fail(res.status, res.message);
    return NextResponse.json({});
  } catch (err) {
    logger.error("auth_email.hook_failed", { error: err });
    return fail(500, "Email could not be sent");
  }
}
