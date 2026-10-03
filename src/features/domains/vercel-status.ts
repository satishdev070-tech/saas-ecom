import { z } from "zod";

/**
 * Pure helpers for the Vercel edge state stored on public.domains (provider_status, dns_records).
 * Shared by the server flow and the settings page; no I/O, unit tested.
 */

export type ProviderStatus = "pending_dns" | "verifying" | "misconfigured" | "active" | "error";

export const PROVIDER_STATUS_LABEL: Record<ProviderStatus, { label: string; tone: "warning" | "success" | "error" | "neutral" }> = {
  pending_dns: { label: "Waiting for DNS", tone: "warning" },
  verifying: { label: "Verifying ownership", tone: "warning" },
  misconfigured: { label: "DNS misconfigured", tone: "error" },
  active: { label: "Live with SSL", tone: "success" },
  error: { label: "Check delayed", tone: "neutral" },
};

/** Seller-facing explanation for a Vercel state (null when nothing to do). */
export function vercelStateMessage(state: Exclude<ProviderStatus, "error">): string | null {
  switch (state) {
    case "verifying":
      return "Vercel needs to confirm you own this domain. Add the TXT record marked “Vercel verification” below.";
    case "pending_dns":
      return "Your domain doesn't point to us yet. Add the A or CNAME record below at your domain provider.";
    case "misconfigured":
      return "Your domain's DNS doesn't match yet. Remove any other A, AAAA or CNAME records for this name and keep only the record below.";
    case "active":
      return null;
  }
}

const recordSchema = z.object({
  type: z.enum(["A", "CNAME", "TXT"]),
  name: z.string().min(1).max(260),
  value: z.string().min(1).max(500),
  purpose: z.enum(["ownership", "routing", "vercel-verification", "redirect"]),
});
export type StoredDnsRecord = z.infer<typeof recordSchema>;

/** Reads the dns_records jsonb defensively: malformed entries are dropped, duplicates removed. */
export function parseStoredDnsRecords(raw: unknown): StoredDnsRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredDnsRecord[] = [];
  for (const item of raw) {
    const r = recordSchema.safeParse(item);
    if (!r.success) continue;
    const key = `${r.data.type}|${r.data.name}|${r.data.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.data);
  }
  return out;
}

export const RECORD_PURPOSE_LABEL: Record<StoredDnsRecord["purpose"], string> = {
  ownership: "Proves you own the domain",
  routing: "Points your domain to your store",
  "vercel-verification": "Vercel verification",
  redirect: "Redirects to your main domain",
};

export function isProviderStatus(v: unknown): v is ProviderStatus {
  return typeof v === "string" && v in PROVIDER_STATUS_LABEL;
}
