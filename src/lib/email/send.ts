import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/observability/logger";
import { formatFrom, hashRecipient, isEmailAddress, maskEmail, normaliseIdempotencyKey } from "./address";
import { postToResend } from "./resend";

export type EmailSendInput = {
  /** Server-resolved tenant (verified host / membership / verified webhook); null for platform mail. */
  tenantId: string | null;
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Display name for the From header (store name). The address always comes from EMAIL_FROM. */
  fromName?: string | null;
  replyTo?: string | null;
  idempotencyKey: string;
};

/**
 * "sent"    = Resend accepted it (has a provider id).
 * "logged"  = no RESEND_API_KEY: NOT delivered, metadata logged only (dev fallback).
 * "skipped" = not attempted (invalid recipient, already sent for this idempotency key).
 * "failed"  = provider/network error.
 */
export type EmailSendResult = { status: "sent" | "logged" | "skipped" | "failed"; providerMessageId?: string | null; error?: string };

type LogRow = { status: EmailSendResult["status"]; provider: "resend" | "log"; providerMessageId?: string | null; error?: string | null };

/**
 * Sends one transactional email through Resend and records it in `email_log`. Never throws.
 * Bodies are never logged; recipients only appear hashed + masked.
 */
export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const env = serverEnv();
  const admin = createSupabaseAdminClient();
  const to = input.to.trim().toLowerCase();
  const key = normaliseIdempotencyKey(input.idempotencyKey);
  const meta = { tenantId: input.tenantId, kind: input.kind, to: isEmailAddress(to) ? maskEmail(to) : "invalid" };

  const record = async (row: LogRow) => {
    const { error } = await admin.from("email_log").insert({
      tenant_id: input.tenantId,
      kind: input.kind.slice(0, 60),
      recipient_hash: isEmailAddress(to) ? hashRecipient(to) : "invalid",
      recipient_masked: isEmailAddress(to) ? maskEmail(to) : null,
      idempotency_key: key,
      provider: row.provider,
      provider_message_id: row.providerMessageId ?? null,
      status: row.status,
      error: row.error?.slice(0, 300) ?? null,
    });
    // 23505 = a concurrent send already recorded "sent" for this key; nothing to do.
    if (error && error.code !== "23505") logger.warn("email.log_failed", { ...meta, code: error.code });
  };

  try {
    if (!isEmailAddress(to)) {
      await record({ status: "skipped", provider: "log", error: "invalid recipient" });
      return { status: "skipped", error: "invalid recipient" };
    }

    const { data: already } = await admin.from("email_log").select("id").eq("idempotency_key", key).eq("status", "sent").limit(1).maybeSingle();
    if (already) return { status: "skipped", error: "already sent" };

    const from = formatFrom(env.EMAIL_FROM, input.fromName);
    const replyTo = input.replyTo && isEmailAddress(input.replyTo) ? input.replyTo.trim() : null;

    if (!env.RESEND_API_KEY) {
      logger.info("email.not_sent_no_provider", { ...meta, reason: "RESEND_API_KEY not set" });
      await record({ status: "logged", provider: "log", error: "RESEND_API_KEY not set" });
      return { status: "logged", error: "email provider not configured" };
    }

    const result = await postToResend({ from, to, subject: input.subject, html: input.html, text: input.text, replyTo, idempotencyKey: key, kind: input.kind }, env.RESEND_API_KEY);
    if (result.ok) {
      await record({ status: "sent", provider: "resend", providerMessageId: result.id });
      return { status: "sent", providerMessageId: result.id };
    }
    logger.warn("email.failed", { ...meta, error: result.error });
    await record({ status: "failed", provider: "resend", error: result.error });
    return { status: "failed", error: result.error };
  } catch (err) {
    logger.error("email.error", { ...meta, error: err instanceof Error ? err.message : "error" });
    await record({ status: "failed", provider: "resend", error: "internal error" }).catch(() => undefined);
    return { status: "failed", error: "internal error" };
  }
}
