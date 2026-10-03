/** Store profile JSON readers (pure). Defensive: the jsonb columns are seller-edited. */

export type StoreAddress = { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function readAddress(value: unknown): StoreAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  return { line1: str(v.line1), line2: str(v.line2), city: str(v.city, 80), state: str(v.state, 80), postalCode: str(v.postal_code, 10), country: str(v.country, 2) };
}

export function formatAddress(a: StoreAddress): string[] {
  const lines = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postalCode ? ` ${a.postalCode}` : "")];
  return lines.map((l) => (l ?? "").trim()).filter(Boolean);
}

export const SOCIAL_NETWORKS = {
  instagram: { label: "Instagram", hosts: ["instagram.com"] },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  pinterest: { label: "Pinterest", hosts: ["pinterest.com", "pinterest.in"] },
  x: { label: "X", hosts: ["x.com", "twitter.com"] },
  twitter: { label: "X", hosts: ["x.com", "twitter.com"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"] },
  threads: { label: "Threads", hosts: ["threads.net"] },
} as const;
export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;
export type SocialLink = { network: SocialNetwork; label: string; url: string };

/** Only https links on the network's own hosts survive (no javascript:, no look-alike hosts). */
export function readSocialLinks(value: unknown): SocialLink[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: SocialLink[] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(key in SOCIAL_NETWORKS) || typeof raw !== "string") continue;
    const net = SOCIAL_NETWORKS[key as SocialNetwork];
    try {
      const u = new URL(raw.trim());
      const host = u.hostname.replace(/^(www|m)\./, "");
      if (u.protocol !== "https:" || u.username || u.password) continue;
      if (!(net.hosts as readonly string[]).some((h) => host === h || host.endsWith(`.${h}`))) continue;
      if (seen.has(net.label)) continue;
      seen.add(net.label);
      out.push({ network: key as SocialNetwork, label: net.label, url: u.toString() });
    } catch {
      continue;
    }
  }
  return out;
}

/** wa.me link from an Indian mobile in any common format, or null. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : null;
  return national && /^[6-9]\d{9}$/.test(national) ? `https://wa.me/91${national}` : null;
}

/** tel: href (digits and a leading + only). */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(clean) ? `tel:${clean}` : null;
}
