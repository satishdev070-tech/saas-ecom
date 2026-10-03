import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { sha256Hex } from "@/lib/crypto";
import { logger } from "@/lib/observability/logger";

/** Client IP as seen by Cloudflare / the platform proxy. Hashed before use as a key. */
export async function clientIpKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha256Hex(ip).slice(0, 24);
}

/**
 * Fixed-window limiter backed by Postgres (public.svc_rate_limit). Throws RATE_LIMITED when
 * exceeded. Fails OPEN on infrastructure errors (logged) so an outage can't lock out checkout;
 * volumetric protection lives at the Cloudflare edge.
 */
export async function rateLimit(bucket: string, subject: string, limit: number, windowSeconds: number): Promise<void> {
  const key = `${bucket}:${subject}`.slice(0, 200);
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("svc_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    if (data === false) throw new AppError("RATE_LIMITED", { context: { bucket } });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("rate_limit.unavailable", { bucket, error: err });
  }
}
