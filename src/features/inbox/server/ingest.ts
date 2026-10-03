import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logger } from "@/lib/observability/logger";
import { clip, type InboxChannel, type InboxEvent, type InboundMessage } from "../webhook";

/**
 * Stores verified webhook events. Runs ONLY after the X-Hub-Signature-256 check passed, with the
 * secret-key client (ADR-006: verified webhooks). The tenant is never taken from the payload: the
 * Page id / Instagram account id / WhatsApp phone_number_id is looked up in tenant_integrations
 * rows that a store connected itself (OAuth, or the validated WhatsApp form). Unknown or ambiguous
 * ids are ignored. Inserts are idempotent through unique (tenant_id, external_id).
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const PROVIDER_FOR: Record<InboxChannel, { provider: "facebook" | "instagram" | "whatsapp"; key: string }> = {
  facebook: { provider: "facebook", key: "account_id" },
  instagram: { provider: "instagram", key: "account_id" },
  whatsapp: { provider: "whatsapp", key: "phone_number_id" },
};

/** Tenant that connected this account id (connected + enabled). Null when unknown or claimed by more than one store. */
export async function tenantForAccount(admin: Admin, channel: InboxChannel, accountId: string): Promise<string | null> {
  const { provider, key } = PROVIDER_FOR[channel];
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("tenant_id")
    .eq("provider", provider)
    .eq("status", "connected")
    .eq("enabled", true)
    .eq(`public_config->>${key}`, accountId)
    .limit(2);
  if (error) {
    logger.error("inbox.tenant_lookup_failed", { channel, error });
    return null;
  }
  if (!data?.length) return null;
  if (data.length > 1) {
    logger.warn("inbox.ambiguous_account", { channel });
    return null;
  }
  return data[0]!.tenant_id;
}

async function conversationId(admin: Admin, tenantId: string, ev: InboundMessage): Promise<string | null> {
  const key = { tenant_id: tenantId, channel: ev.channel, external_thread_id: ev.participantId };
  await admin.from("social_conversations").upsert({ ...key, participant_id: ev.participantId, participant_name: ev.participantName }, { onConflict: "tenant_id,channel,external_thread_id", ignoreDuplicates: true });
  const { data } = await admin.from("social_conversations").select("id").match(key).maybeSingle();
  return data?.id ?? null;
}

async function storeMessage(admin: Admin, tenantId: string, ev: InboundMessage) {
  const convId = await conversationId(admin, tenantId, ev);
  if (!convId) return;
  const { data: inserted, error } = await admin
    .from("social_messages")
    .upsert(
      { tenant_id: tenantId, conversation_id: convId, direction: ev.direction, body: ev.text, media_url: ev.mediaUrl, external_id: ev.externalId, status: ev.direction === "in" ? "received" : "sent", sent_at: ev.at },
      { onConflict: "tenant_id,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    logger.error("inbox.message_insert_failed", { tenantId, channel: ev.channel, error });
    return;
  }
  if (!inserted?.length) return; // duplicate delivery (Meta retries) or the echo of our own reply.

  const { data: conv } = await admin.from("social_conversations").select("unread_count, last_message_at, last_inbound_at, participant_name").eq("tenant_id", tenantId).eq("id", convId).single();
  const newer = (a: string | null | undefined) => !a || Date.parse(ev.at) >= Date.parse(a);
  const patch: Database["public"]["Tables"]["social_conversations"]["Update"] = {};
  if (newer(conv?.last_message_at)) Object.assign(patch, { last_message_at: ev.at, last_preview: clip(ev.text || "[attachment]", 300) });
  if (ev.direction === "in") {
    patch.unread_count = (conv?.unread_count ?? 0) + 1;
    patch.status = "open";
    if (newer(conv?.last_inbound_at)) patch.last_inbound_at = ev.at;
    if (ev.participantName && ev.participantName !== conv?.participant_name) patch.participant_name = ev.participantName;
  }
  if (Object.keys(patch).length) await admin.from("social_conversations").update(patch).eq("tenant_id", tenantId).eq("id", convId);
}

/** Persists parsed events. Never throws (the webhook must still answer 200). */
export async function ingestEvents(events: InboxEvent[]): Promise<{ stored: number; ignored: number }> {
  if (!events.length) return { stored: 0, ignored: 0 };
  const admin = createSupabaseAdminClient();
  const tenants = new Map<string, string | null>();
  let stored = 0;
  let ignored = 0;
  for (const ev of events) {
    try {
      const cacheKey = `${ev.channel}:${ev.accountId}`;
      if (!tenants.has(cacheKey)) tenants.set(cacheKey, await tenantForAccount(admin, ev.channel, ev.accountId));
      const tenantId = tenants.get(cacheKey);
      if (!tenantId) {
        ignored++;
        continue;
      }
      if (ev.type === "message") await storeMessage(admin, tenantId, ev);
      else
        await admin
          .from("social_messages")
          .update({ status: ev.status, error: ev.error })
          .eq("tenant_id", tenantId)
          .eq("external_id", ev.externalId)
          .eq("direction", "out")
          .neq("status", "failed");
      stored++;
    } catch (err) {
      logger.error("inbox.ingest_failed", { channel: ev.channel, error: err });
    }
  }
  return { stored, ignored };
}
