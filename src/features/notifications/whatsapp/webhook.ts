import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { tenantForAccount } from "@/features/inbox/server/ingest";
import { setOptInFromKeyword } from "./consent";
import { parseNotificationWebhook } from "./webhook-parse";
import { shouldApplyStatus } from "./policy";

/**
 * Applies WhatsApp delivery statuses (sent / delivered / read / failed) to notification_jobs and
 * STOP / START keywords to the consent ledger. Call ONLY after the X-Hub-Signature-256 check
 * passed (the inbox webhook handler does that). The tenant comes from the connected
 * phone_number_id, never from the payload. Never throws.
 */
export async function handleWhatsAppNotificationWebhook(body: unknown): Promise<void> {
  try {
    const { statuses, keywords } = parseNotificationWebhook(body);
    if (!statuses.length && !keywords.length) return;
    const admin = createSupabaseAdminClient();
    const tenants = new Map<string, string | null>();
    const tenantOf = async (accountId: string) => {
      if (!tenants.has(accountId)) tenants.set(accountId, await tenantForAccount(admin, "whatsapp", accountId));
      return tenants.get(accountId) ?? null;
    };
    for (const s of statuses) {
      const tenantId = await tenantOf(s.accountId);
      if (!tenantId) continue;
      const { data: job } = await admin.from("notification_jobs").select("id, status").eq("tenant_id", tenantId).eq("provider_message_id", s.messageId).maybeSingle();
      if (!job || !shouldApplyStatus(job.status, s.status)) continue;
      const at = s.at;
      const patch =
        s.status === "failed"
          ? { status: "failed", last_error: s.error ?? "WhatsApp couldn't deliver this message" }
          : s.status === "read"
            ? { status: "read", read_at: at }
            : s.status === "delivered"
              ? { status: "delivered", delivered_at: at }
              : { status: "sent" };
      await admin.from("notification_jobs").update(patch).eq("tenant_id", tenantId).eq("id", job.id);
    }
    for (const k of keywords) {
      const tenantId = await tenantOf(k.accountId);
      if (tenantId) await setOptInFromKeyword(admin, tenantId, k.from, k.optIn);
    }
  } catch (err) {
    logger.error("whatsapp_notify.webhook_failed", { error: err });
  }
}
