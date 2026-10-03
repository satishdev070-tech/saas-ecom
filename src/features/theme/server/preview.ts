import "server-only";
import { signToken, verifyToken } from "@/lib/crypto";
import { PREVIEW_PURPOSE, PREVIEW_TTL_SECONDS, decodePreviewClaims, encodePreviewClaims, type PreviewClaims } from "../preview";

/** Mints a preview token. Callers must already have checked theme.edit for `tenantId`. */
export function createPreviewToken(tenantId: string, userId: string, nowMs = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(nowMs / 1000) + PREVIEW_TTL_SECONDS;
  return { token: signToken(PREVIEW_PURPOSE, encodePreviewClaims({ tenantId, userId, expiresAt })), expiresAt };
}

/** Verifies signature, tenant binding and expiry. */
export function verifyPreviewToken(token: string | null | undefined, tenantId: string, nowMs = Date.now()): PreviewClaims | null {
  const payload = verifyToken(PREVIEW_PURPOSE, token);
  return payload ? decodePreviewClaims(payload, tenantId, nowMs) : null;
}
