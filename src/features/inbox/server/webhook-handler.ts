import "server-only";
import { handleWhatsAppNotificationWebhook } from "@/features/notifications/whatsapp/webhook";
import { after } from "next/server";
import { getAppCredential } from "@/features/platform-apps/server";
import { logger } from "@/lib/observability/logger";
import { parseMetaPayload, parseWhatsAppPayload, verifyMetaSignature, verifySubscription, type InboxEvent } from "../webhook";
import { ingestEvents } from "./ingest";

/**
 * Shared Meta webhook handling (Messenger, Instagram, WhatsApp Cloud API all sign with the Meta
 * app secret and use the same hub.verify_token handshake). Credentials come from the super admin
 * console (platform_app_credentials "meta") with env fallback; the verify token is
 * extra.webhookVerifyToken.
 */
const MAX_BODY_BYTES = 512 * 1024;

export async function handleVerification(url: URL): Promise<Response> {
  const cred = await getAppCredential("meta").catch(() => null);
  const challenge = verifySubscription(url.searchParams, cred?.extra.webhookVerifyToken);
  return challenge === null ? new Response("forbidden", { status: 403 }) : new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function handleEvent(request: Request, kind: "meta" | "whatsapp"): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response("payload too large", { status: 413 });
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) return new Response("payload too large", { status: 413 });

  const cred = await getAppCredential("meta").catch(() => null);
  if (!cred?.secret) {
    logger.warn("inbox.webhook_not_configured", { kind });
    return new Response("not configured", { status: 503 });
  }
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), cred.secret)) {
    logger.warn("inbox.webhook_bad_signature", { kind });
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const events: InboxEvent[] = kind === "whatsapp" ? parseWhatsAppPayload(body) : parseMetaPayload(body);
  // Order-notification delivery/read statuses and STOP/START opt-outs.
  if (kind === "whatsapp") after(() => handleWhatsAppNotificationWebhook(body));
  // Answer immediately; Meta retries slow or failed deliveries, and inserts are idempotent.
  if (events.length)
    after(async () => {
      const r = await ingestEvents(events);
      logger.info("inbox.webhook_processed", { kind, events: events.length, stored: r.stored, ignored: r.ignored });
    });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
