import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/crypto";
import { platformOrigin } from "@/lib/platform/urls";

/**
 * OAuth state for Google Business Profile (same pattern as social/server/oauth.ts): an HMAC-signed
 * {tenant, user, nonce, exp} plus the nonce in an httpOnly cookie, so the callback only completes
 * in the browser that started it, for the same user and store, within 10 minutes.
 */
const COOKIE = "pl_gbp_oauth_nonce";
const PURPOSE = "gbp-oauth";
const PATH = "/api/oauth/google-business";
type State = { t: string; u: string; x: string; e: number };

export const gbpRedirectUri = () => `${platformOrigin()}${PATH}/callback`;

export async function createGbpState(tenantId: string, userId: string): Promise<string> {
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: PATH, maxAge: 600 });
  return signToken(PURPOSE, JSON.stringify({ t: tenantId, u: userId, x: nonce, e: Date.now() + 600_000 } satisfies State));
}

export async function consumeGbpState(token: string | null): Promise<State | null> {
  const jar = await cookies();
  const nonce = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: PATH });
  const raw = verifyToken(PURPOSE, token);
  if (!raw || !nonce) return null;
  let s: State;
  try {
    s = JSON.parse(raw) as State;
  } catch {
    return null;
  }
  if (typeof s.t !== "string" || typeof s.u !== "string" || s.e < Date.now()) return null;
  const a = Buffer.from(s.x ?? "");
  const b = Buffer.from(nonce);
  return a.length === b.length && timingSafeEqual(a, b) ? s : null;
}
