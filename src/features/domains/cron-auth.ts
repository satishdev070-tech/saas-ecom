import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer <CRON_SECRET>` check. Compares SHA-256 digests with
 * timingSafeEqual so neither the secret's content nor its length leaks via timing.
 * An unset/short secret never authorizes anything.
 */
export function isAuthorizedCronRequest(authorization: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < 24 || !authorization) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) return false;
  const given = createHash("sha256").update(match[1]!).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
