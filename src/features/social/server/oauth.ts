import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/crypto";
import { platformOrigin } from "@/lib/platform/urls";
import type { SocialNetwork } from "./providers";

/**
 * OAuth state: an HMAC-signed {tenant, user, network, nonce, exp} plus the nonce in an httpOnly
 * cookie, so a callback only completes in the browser that started it, for the same user and
 * store, within 10 minutes.
 */
const COOKIE = "pl_oauth_nonce";
const PURPOSE = "social-oauth";
type State = { t: string; u: string; n: SocialNetwork; x: string; e: number };

export const redirectUriFor = (network: SocialNetwork) => `${platformOrigin()}/api/oauth/${network}/callback`;

export async function createOAuthState(tenantId: string, userId: string, network: SocialNetwork): Promise<string> {
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/oauth", maxAge: 600 });
  return signToken(PURPOSE, JSON.stringify({ t: tenantId, u: userId, n: network, x: nonce, e: Date.now() + 600_000 } satisfies State));
}

export async function consumeOAuthState(token: string | null, network: SocialNetwork): Promise<State | null> {
  const jar = await cookies();
  const nonce = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/oauth" });
  const raw = verifyToken(PURPOSE, token);
  if (!raw || !nonce) return null;
  let s: State;
  try {
    s = JSON.parse(raw) as State;
  } catch {
    return null;
  }
  if (s.n !== network || s.e < Date.now()) return null;
  const a = Buffer.from(s.x);
  const b = Buffer.from(nonce);
  return a.length === b.length && timingSafeEqual(a, b) ? s : null;
}
