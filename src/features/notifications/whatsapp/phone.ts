/**
 * Phone normalisation for WhatsApp (pure). Returns E.164 ("+919876543210") or null.
 * Indian numbers are the default: a 10-digit mobile starting 6-9, optionally prefixed by 0, 91 or
 * +91, becomes +91XXXXXXXXXX. Other countries must already be written with a leading "+".
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (!compact) return null;
  const indian = /^(?:\+91|0091|91|0)?([6-9]\d{9})$/.exec(compact);
  if (indian) return `+91${indian[1]}`;
  const intl = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return intl.startsWith("+") && E164.test(intl) ? intl : null;
}

/** WhatsApp "wa_id" form (digits only), used as the inbox conversation's participant id. */
export function waIdFromE164(e164: string): string {
  return e164.replace(/^\+/, "");
}
