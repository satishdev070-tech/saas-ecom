import { createHash } from "node:crypto";

/** Address helpers for outgoing email. PURE (unit tested); no env, no I/O. */

const EMAIL_RE = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/;

export function isEmailAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

/** Splits `Name <addr@x>` or `addr@x` into parts. Returns null when no valid address is present. */
export function parseMailbox(value: string): { name: string | null; address: string } | null {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>]+)>\s*$/.exec(value);
  const address = (m ? m[2]! : value).trim();
  if (!isEmailAddress(address)) return null;
  const name = m?.[1]?.trim() || null;
  return { name, address };
}

/** Display names are header values: drop control chars and mailbox syntax characters, cap length. */
export function sanitizeDisplayName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f"<>\\,;:@]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
}

/**
 * `"Store Name" <orders@platform-domain>`: the ADDRESS always comes from the verified EMAIL_FROM
 * (only that domain is authorised in Resend); a store only changes the display name.
 */
export function formatFrom(emailFrom: string, displayName?: string | null): string {
  const base = parseMailbox(emailFrom);
  if (!base) throw new Error("EMAIL_FROM is not a valid mailbox");
  const name = sanitizeDisplayName(displayName ?? "") || (base.name ? sanitizeDisplayName(base.name) : "");
  return name ? `${name} <${base.address}>` : base.address;
}

/** `ramya@gmail.com` -> `r***@gmail.com` (for logs and the email_log table). */
export function maskEmail(value: string): string {
  const v = value.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return "***";
  return `${v[0]}***${v.slice(at)}`.slice(0, 120);
}

export function hashRecipient(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Resend accepts Idempotency-Key up to 256 chars; longer keys are hashed deterministically. */
export function normaliseIdempotencyKey(key: string): string {
  return key.length <= 256 ? key : `sha256:${createHash("sha256").update(key).digest("hex")}`;
}
