import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature check (https://www.standardwebhooks.com), as used by Supabase Auth
 * hooks. PURE (unit tested). Secret format `v1,whsec_<base64 key>`; the signed content is
 * `${id}.${timestamp}.${body}` (HMAC-SHA256, base64); the header can carry several
 * space-separated `v1,<sig>` values (key rotation).
 */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function webhookKey(secret: string): Buffer | null {
  const raw = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  return key.length >= 16 ? key : null;
}

export function signStandardWebhook(secret: string, id: string, timestamp: string, body: string): string {
  const key = webhookKey(secret);
  if (!key) throw new Error("invalid webhook secret");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

export function verifyStandardWebhook(input: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number }): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(signStandardWebhook(input.secret, id, timestamp, input.body).slice(3), "base64");
  } catch {
    return false;
  }
  return signature
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .some((s) => {
      const got = Buffer.from(s.slice(3), "base64");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}
