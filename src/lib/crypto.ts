import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

/** Purpose-bound key derived from APP_SECRET (HKDF-SHA256). Never reuse a key across purposes. */
function deriveKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", serverEnv().APP_SECRET, "paliya", purpose, 32));
}

/** `payload.signature` token (base64url). Used for cart cookies and similar opaque handles. */
export function signToken(purpose: string, payload: string): string {
  const sig = createHmac("sha256", deriveKey(`sign:${purpose}`)).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyToken(purpose: string, token: string | undefined | null): string | null {
  if (!token || token.length > 1024) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", deriveKey(`sign:${purpose}`)).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return payload;
}

/** AES-256-GCM encryption for secrets at rest (e.g. tenant Razorpay key secret). */
export function encryptSecret(plaintext: string, purpose = "tenant-secrets"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(`enc:${purpose}`), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ct.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptSecret(value: string, purpose = "tenant-secrets"): string {
  const [v, iv, ct, tag] = value.split(".");
  if (v !== "v1" || !iv || !ct || !tag) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(`enc:${purpose}`), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash for storing lookups of secrets we must not keep in clear (invite tokens). */
export function hashToken(token: string): string {
  return createHmac("sha256", deriveKey("hash:tokens")).update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
