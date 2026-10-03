/**
 * Integration configuration presence for /admin/health. Reports BOOLEANS ONLY:
 * values (even partial or masked) are never read into the result.
 */
export const INTEGRATION_ENV: readonly { id: string; label: string; required: readonly string[]; optional?: readonly string[]; note: string }[] = [
  { id: "resend", label: "Email (Resend)", required: ["RESEND_API_KEY"], optional: ["EMAIL_FROM"], note: "Transactional emails are logged instead of sent when missing. A key saved in Admin → Email (Resend) overrides the env vars." },
  { id: "cloudflare", label: "Cloudflare for SaaS", required: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "CUSTOM_DOMAIN_CNAME_TARGET"], note: "Needed for custom-domain SSL and routing." },
  { id: "edge", label: "Edge worker signature", required: ["EDGE_SHARED_SECRET"], note: "Without it the app trusts only the literal Host header." },
  { id: "meta", label: "Meta app (Facebook & Instagram)", required: ["META_APP_ID", "META_APP_SECRET"], optional: ["META_GRAPH_VERSION"], note: "Lets sellers connect a Facebook Page and Instagram business account." },
  { id: "pinterest", label: "Pinterest app", required: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"], note: "Lets sellers connect Pinterest and create Pins." },
  { id: "google", label: "Google OAuth (YouTube)", required: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"], note: "Lets sellers connect a YouTube channel." },
  { id: "cron", label: "Scheduled jobs", required: ["CRON_SECRET"], note: "Protects /api/cron/* (order expiry, domain checks, scheduled social posts)." },
];

export type IntegrationPresence = { id: string; label: string; note: string; configured: boolean; vars: { name: string; present: boolean; required: boolean }[] };

export function integrationPresence(env: Record<string, string | undefined>): IntegrationPresence[] {
  const present = (name: string) => typeof env[name] === "string" && env[name]!.trim().length > 0;
  return INTEGRATION_ENV.map((i) => {
    const vars = [...i.required.map((name) => ({ name, present: present(name), required: true })), ...(i.optional ?? []).map((name) => ({ name, present: present(name), required: false }))];
    return { id: i.id, label: i.label, note: i.note, configured: vars.filter((v) => v.required).every((v) => v.present), vars };
  });
}

/** Human-readable byte size (binary units). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
