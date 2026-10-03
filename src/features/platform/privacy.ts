/**
 * Masking for the read-only support view: staff can recognise a customer the seller is asking
 * about ("r•••@gmail.com", "+91 •••••• 3210") without the view exposing full contact details.
 */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}${"•".repeat(Math.min(Math.max(local.length - 1, 3), 8))}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  const cc = phone.startsWith("+91") ? "+91 " : phone.startsWith("+") ? "+" : "";
  return `${cc}${"•".repeat(6)} ${digits.slice(-4)}`;
}

/** First name + last initial ("Riya S."). */
export function shortName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "—";
  return l ? `${f || "—"} ${l[0]!.toUpperCase()}.` : f;
}
