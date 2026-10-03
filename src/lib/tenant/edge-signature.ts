/**
 * Verification of the host header forwarded by the Cloudflare domain-router Worker.
 *
 * The Worker sends:
 *   x-paliya-edge-host: <original customer hostname>
 *   x-paliya-edge-ts:   <unix seconds>
 *   x-paliya-edge-sig:  hex(HMAC-SHA256(EDGE_SHARED_SECRET, `${host}\n${ts}`))
 *
 * Unsigned or stale headers are ignored, so anyone reaching the origin directly
 * cannot impersonate a tenant hostname. Uses Web Crypto (works in Node, edge and Workers).
 */

export const EDGE_HOST_HEADER = "x-paliya-edge-host";
export const EDGE_TS_HEADER = "x-paliya-edge-ts";
export const EDGE_SIG_HEADER = "x-paliya-edge-sig";
export const EDGE_SIGNATURE_MAX_AGE_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signEdgeHost(secret: string, host: string, tsSeconds: number): Promise<string> {
  return hmacHex(secret, `${host}\n${tsSeconds}`);
}

export async function verifyEdgeHost(params: {
  secret: string | undefined;
  host: string | null;
  ts: string | null;
  signature: string | null;
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, host, ts, signature } = params;
  if (!secret || !host || !ts || !signature) return false;
  if (!/^\d{1,12}$/.test(ts) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const age = now - Number(ts);
  if (age < -30 || age > EDGE_SIGNATURE_MAX_AGE_SECONDS) return false; // allow small clock skew
  const expected = await hmacHex(secret, `${host}\n${ts}`);
  return timingSafeEqual(expected, signature);
}
