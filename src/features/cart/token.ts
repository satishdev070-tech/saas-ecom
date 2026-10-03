import "server-only";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/crypto";
import { parseCartPayload } from "./token-format";

/**
 * Cart cookie (ADR-023). Host-only (no Domain attribute) so every store host has its own
 * cart; httpOnly + SameSite=Lax; value = signToken("cart", `${tenantId}:${cartId}`).
 * The server trusts the cart id only after verifying the HMAC AND that the embedded tenant
 * equals the tenant resolved from the verified host.
 */
export const CART_COOKIE = "paliya_cart";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function readCartIdFromCookie(tenantId: string): Promise<string | null> {
  const raw = (await cookies()).get(CART_COOKIE)?.value;
  return parseCartPayload(verifyToken("cart", raw), tenantId);
}

/** Only callable from a Server Action or Route Handler. */
export async function writeCartCookie(tenantId: string, cartId: string): Promise<void> {
  (await cookies()).set(CART_COOKIE, signToken("cart", `${tenantId}:${cartId}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearCartCookie(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
