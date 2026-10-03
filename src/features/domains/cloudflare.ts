import { z } from "zod";
import type { SslStatus } from "./rules";

/**
 * Cloudflare for SaaS "custom hostnames" API (fetch only, no SDK).
 * https://developers.cloudflare.com/api/resources/custom_hostnames/
 * Pure helpers (status mapping, response parsing) are unit tested; network calls take
 * an explicit config so they can be exercised with a fake fetch.
 */

export type CloudflareConfig = { apiToken: string; zoneId: string; fetchImpl?: typeof fetch; timeoutMs?: number };

const API = "https://api.cloudflare.com/client/v4";
const ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;
const ZONE_PATTERN = /^[a-f0-9]{32}$/;

const hostnameResultSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  status: z.string().optional(),
  ssl: z.object({ status: z.string().optional(), validation_errors: z.array(z.object({ message: z.string() })).optional() }).optional(),
  verification_errors: z.array(z.string()).optional(),
});
const envelopeSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number().optional(), message: z.string() })).default([]),
  result: z.unknown().optional(),
});

export type CustomHostname = { id: string; hostname: string; sslStatus: SslStatus; hostnameStatus: string | null; errors: string[] };

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codes: number[] = [],
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

/**
 * Maps Cloudflare's SSL lifecycle to our column. Pending covers initializing/pending_* states;
 * anything terminal and unhealthy is failed. Unknown values stay pending (safer than active).
 */
export function mapCloudflareSslStatus(status: string | null | undefined): SslStatus {
  switch (status) {
    case "active":
      return "active";
    case "expired":
    case "deleted":
    case "validation_timed_out":
    case "issuance_timed_out":
    case "deployment_timed_out":
    case "deletion_timed_out":
    case "pending_cleanup":
    case "timed_out":
      return "failed";
    default:
      return "pending";
  }
}

export function parseCustomHostname(result: unknown): CustomHostname | null {
  const parsed = hostnameResultSchema.safeParse(result);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    hostname: r.hostname,
    sslStatus: mapCloudflareSslStatus(r.ssl?.status),
    hostnameStatus: r.status ?? null,
    errors: [...(r.ssl?.validation_errors?.map((e) => e.message) ?? []), ...(r.verification_errors ?? [])].slice(0, 5),
  };
}

/** Config from env, or null when Cloudflare isn't configured (dev / before go-live). */
export function cloudflareConfigFrom(env: { CLOUDFLARE_API_TOKEN?: string; CLOUDFLARE_ZONE_ID?: string }): CloudflareConfig | null {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID || !ZONE_PATTERN.test(env.CLOUDFLARE_ZONE_ID)) return null;
  return { apiToken: env.CLOUDFLARE_API_TOKEN, zoneId: env.CLOUDFLARE_ZONE_ID };
}

async function call(cfg: CloudflareConfig, method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const res = await (cfg.fetchImpl ?? fetch)(`${API}/zones/${cfg.zoneId}${path}`, {
    method,
    headers: { authorization: `Bearer ${cfg.apiToken}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 8000),
    cache: "no-store",
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through to the generic error below
  }
  const env = envelopeSchema.safeParse(json);
  if (!res.ok || !env.success || !env.data.success) {
    const errors = env.success ? env.data.errors : [];
    throw new CloudflareApiError(errors.map((e) => e.message).join("; ") || `Cloudflare API ${res.status}`, res.status, errors.flatMap((e) => (e.code ? [e.code] : [])));
  }
  return env.data.result;
}

export async function findCustomHostname(cfg: CloudflareConfig, hostname: string): Promise<CustomHostname | null> {
  const result = await call(cfg, "GET", `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
  const list = Array.isArray(result) ? result : [];
  for (const r of list) {
    const parsed = parseCustomHostname(r);
    if (parsed && parsed.hostname === hostname) return parsed;
  }
  return null;
}

/**
 * Creates the custom hostname (HTTP DCV, DV cert, TLS ≥ 1.2). Idempotent: if Cloudflare
 * says it already exists in our zone, the existing record is returned.
 */
export async function createCustomHostname(cfg: CloudflareConfig, hostname: string): Promise<CustomHostname> {
  try {
    const result = await call(cfg, "POST", "/custom_hostnames", {
      hostname,
      ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
    });
    const parsed = parseCustomHostname(result);
    if (!parsed) throw new CloudflareApiError("Unexpected Cloudflare response", 502);
    return parsed;
  } catch (err) {
    if (err instanceof CloudflareApiError && (err.status === 409 || err.codes.includes(1406))) {
      const existing = await findCustomHostname(cfg, hostname);
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getCustomHostname(cfg: CloudflareConfig, id: string): Promise<CustomHostname | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return parseCustomHostname(await call(cfg, "GET", `/custom_hostnames/${id}`));
  } catch (err) {
    if (err instanceof CloudflareApiError && err.status === 404) return null;
    throw err;
  }
}

/** Deletes the custom hostname; a 404 (already gone) counts as success. */
export async function deleteCustomHostname(cfg: CloudflareConfig, id: string): Promise<void> {
  if (!ID_PATTERN.test(id)) return;
  try {
    await call(cfg, "DELETE", `/custom_hostnames/${id}`);
  } catch (err) {
    if (err instanceof CloudflareApiError && err.status === 404) return;
    throw err;
  }
}
