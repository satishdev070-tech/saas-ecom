import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { logger } from "@/lib/observability/logger";
import { activeWhatsApp, markWhatsAppExpired } from "@/features/inbox/server/whatsapp";
import { clip } from "@/features/inbox/webhook";
import { sendTemplateMessage, type FetchLike } from "./cloud-api";
import { nextState, type AttemptOutcome } from "./policy";
import { buildTemplatePayload, type JobParam } from "./templates";
import { waIdFromE164 } from "./phone";

/**
 * notification_jobs queue. Background work with the secret-key client (ADR-006: background
 * jobs); every query filters by the job's tenant id. Jobs are claimed by SQL functions
 * (FOR UPDATE SKIP LOCKED) so overlapping cron runs never send the same job twice.
 */
type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type JobRow = Database["public"]["Tables"]["notification_jobs"]["Row"];
export type NewJob = {
  tenantId: string;
  event: JobRow["event"];
  idempotencyKey: string;
  orderId?: string | null;
  cartId?: string | null;
  recipient: string;
  templateName: string;
  languageCode: string;
  params: JobParam[];
  preview: string | null;
  maxAttempts?: number;
};

/** Inserts a queued job; null when a job with the same idempotency key already exists. */
export async function enqueueJob(job: NewJob, admin: Admin = createSupabaseAdminClient()): Promise<string | null> {
  const { data, error } = await admin
    .from("notification_jobs")
    .upsert(
      {
        tenant_id: job.tenantId,
        channel: "whatsapp",
        event: job.event,
        idempotency_key: job.idempotencyKey.slice(0, 300),
        order_id: job.orderId ?? null,
        cart_id: job.cartId ?? null,
        recipient: job.recipient,
        template_name: job.templateName,
        language_code: job.languageCode,
        params: job.params as unknown as Json,
        preview: job.preview,
        max_attempts: job.maxAttempts ?? 5,
      },
      { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    logger.error("whatsapp_notify.enqueue_failed", { tenantId: job.tenantId, event: job.event, error: error.message });
    throw new Error("enqueue failed");
  }
  return data?.[0]?.id ?? null;
}

function paramsOf(job: JobRow): JobParam[] {
  return Array.isArray(job.params) ? (job.params as unknown as JobParam[]).filter((p) => p && typeof p.text === "string") : [];
}

/** Sends one claimed job and records the outcome. Never throws. */
export async function attemptJob(job: JobRow, opts: { admin?: Admin; fetchImpl?: FetchLike } = {}): Promise<JobRow["status"]> {
  const admin = opts.admin ?? createSupabaseAdminClient();
  let outcome: AttemptOutcome;
  const wa = await activeWhatsApp(job.tenant_id).catch(() => null);
  if (!wa) outcome = { ok: false, httpStatus: 400, code: null, message: "WhatsApp isn't connected for this store." };
  else {
    const payload = buildTemplatePayload({ to: job.recipient, templateName: job.template_name, languageCode: job.language_code, params: paramsOf(job) });
    outcome = await sendTemplateMessage(wa.phoneNumberId, wa.token, payload, opts.fetchImpl);
    if (!outcome.ok && (outcome.httpStatus === 401 || outcome.code === 190)) await markWhatsAppExpired(job.tenant_id, outcome.message);
  }
  const next = nextState(outcome, job.attempts, job.max_attempts);
  const now = new Date().toISOString();
  const patch: Database["public"]["Tables"]["notification_jobs"]["Update"] =
    next.status === "sent"
      ? { status: "sent", provider_message_id: next.providerMessageId, sent_at: now, last_error: null, locked_at: null }
      : next.status === "queued"
        ? { status: "queued", next_attempt_at: next.nextAttemptAt.toISOString(), last_error: next.lastError.slice(0, 500), locked_at: null }
        : { status: "failed", last_error: next.lastError.slice(0, 500), locked_at: null };
  const { error } = await admin.from("notification_jobs").update(patch).eq("tenant_id", job.tenant_id).eq("id", job.id).eq("status", "sending");
  if (error) logger.error("whatsapp_notify.job_update_failed", { tenantId: job.tenant_id, jobId: job.id, error: error.message });
  if (next.status === "sent") await mirrorToInbox(admin, job, next.providerMessageId, now);
  else logger.warn("whatsapp_notify.attempt_failed", { tenantId: job.tenant_id, jobId: job.id, event: job.event, attempt: job.attempts, final: next.status === "failed" });
  return next.status;
}

/** Adds the sent template to the store's inbox thread with this customer, if one exists. */
async function mirrorToInbox(admin: Admin, job: JobRow, messageId: string, at: string) {
  try {
    const waId = waIdFromE164(job.recipient);
    const { data: conv } = await admin.from("social_conversations").select("id, last_message_at").eq("tenant_id", job.tenant_id).eq("channel", "whatsapp").eq("external_thread_id", waId).maybeSingle();
    if (!conv) return;
    const body = clip(job.preview || `[WhatsApp template: ${job.template_name}]`, 4096);
    const { data: inserted } = await admin
      .from("social_messages")
      .upsert({ tenant_id: job.tenant_id, conversation_id: conv.id, direction: "out", body, external_id: messageId, status: "sent", sent_at: at }, { onConflict: "tenant_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (inserted?.length && (!conv.last_message_at || Date.parse(at) >= Date.parse(conv.last_message_at)))
      await admin.from("social_conversations").update({ last_message_at: at, last_preview: clip(body, 300) }).eq("tenant_id", job.tenant_id).eq("id", conv.id);
  } catch (err) {
    logger.warn("whatsapp_notify.inbox_mirror_failed", { tenantId: job.tenant_id, error: err });
  }
}

/** Claims and sends one job right away (after enqueue). Returns its new status, or null if not claimable. */
export async function processJob(jobId: string): Promise<JobRow["status"] | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("svc_claim_notification_job", { p_job: jobId });
  if (error) {
    logger.error("whatsapp_notify.claim_failed", { error: error.message });
    return null;
  }
  const job = (data as JobRow[] | null)?.[0];
  return job ? attemptJob(job, { admin }) : null;
}

/** Cron: claims due jobs and sends them sequentially. */
export async function processDueJobs(limit = 25): Promise<{ claimed: number; sent: number; retrying: number; failed: number }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("svc_claim_notification_jobs", { p_limit: limit });
  if (error) {
    logger.error("whatsapp_notify.claim_failed", { error: error.message });
    throw new Error("claim failed");
  }
  const jobs = (data as JobRow[] | null) ?? [];
  const r = { claimed: jobs.length, sent: 0, retrying: 0, failed: 0 };
  for (const job of jobs) {
    const s = await attemptJob(job, { admin });
    if (s === "sent") r.sent++;
    else if (s === "queued") r.retrying++;
    else r.failed++;
  }
  return r;
}
