import "server-only";
import { buildLocalPost, type LocalPostInput } from "../gbp";
import { createLocalPost, type Result } from "./api";
import { gbpAccess, recordGbpStatus } from "./connection";

/** Planner → Google Business local post (STANDARD). Tenant id comes from the claimed post row. */
export async function publishGoogleLocalPost(tenantId: string, input: LocalPostInput): Promise<Result<{ id: string; url: string | null }>> {
  const access = await gbpAccess(tenantId);
  if (!access.ok) return access;
  if (!access.data.location) return { ok: false, message: "Choose your Google Business location in Marketing → Google." };
  if (!input.caption.trim()) return { ok: false, message: "Google posts need text: add a caption." };
  const r = await createLocalPost(access.data.token, access.data.location, buildLocalPost(input));
  if (!r.ok && r.expired) await recordGbpStatus(tenantId, "expired", r.message);
  return r;
}
