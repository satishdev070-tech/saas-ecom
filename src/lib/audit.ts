import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/crypto";
import { logger } from "@/lib/observability/logger";
import { REQUEST_ID_HEADER } from "@/lib/tenant/routing";
import type { Json } from "@/lib/supabase/database.types";

type AuditInput = {
  tenantId: string | null;
  actorUserId: string | null;
  actorType?: "user" | "platform" | "support" | "system" | "webhook";
  action: `${string}.${string}`;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, Json | undefined>;
};

/**
 * Records a sensitive action. Never throws: an audit failure is logged loudly but must
 * not undo a completed business action. Callers pass ids resolved server-side only.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      actor_type: input.actorType ?? "user",
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: (input.metadata ?? {}) as Json,
      ip_hash: ip ? sha256Hex(ip).slice(0, 32) : null,
      request_id: h.get(REQUEST_ID_HEADER),
    });
    if (error) throw error;
  } catch (err) {
    logger.error("audit.write_failed", { action: input.action, error: err });
  }
}
