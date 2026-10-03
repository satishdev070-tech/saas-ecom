import "server-only";
import { z } from "zod";

/**
 * Vercel REST API client for project domains (fetch only, no SDK). Endpoints (docs, Oct 2026):
 *   POST   /v10/projects/{idOrName}/domains                 add (body: name, redirect, redirectStatusCode)
 *   GET    /v9/projects/{idOrName}/domains/{domain}         verified + verification[] (TXT challenges)
 *   POST   /v9/projects/{idOrName}/domains/{domain}/verify  re-check the TXT challenge
 *   DELETE /v9/projects/{idOrName}/domains/{domain}         remove (body: removeRedirects)
 *   GET    /v6/domains/{domain}/config                      misconfigured, configuredBy, recommendedIPv4/CNAME
 * All accept `teamId`. https://vercel.com/docs/rest-api
 *
 * Pure helpers (parsing, status mapping, DNS record building) are exported for unit tests;
 * network calls take an explicit config so tests can pass a fake fetch. The token is never logged.
 */

export const VERCEL_API = "https://api.vercel.com";
/** Used only when the config endpoint returns no recommendation (Vercel's documented defaults). */
export const VERCEL_FALLBACK_A = "76.76.21.21";
export const VERCEL_FALLBACK_CNAME = "cname.vercel-dns.com";

export type VercelConfig = { token: string; projectId: string; teamId: string | null; fetchImpl?: typeof fetch; timeoutMs?: number };

const PROJECT_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const TEAM_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Config from env (VERCEL_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID), or null when not configured. */
export function vercelConfigFrom(env: Partial<Record<string, string | undefined>>): VercelConfig | null {
  const token = env.VERCEL_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim() || null;
  if (!token || token.length < 20 || /\s/.test(token)) return null;
  if (!projectId || !PROJECT_PATTERN.test(projectId)) return null;
  if (teamId && !TEAM_PATTERN.test(teamId)) return null;
  return { token, projectId, teamId };
}

export function vercelConfig(): VercelConfig | null {
  return vercelConfigFrom(process.env);
}

// ---- Response schemas -----------------------------------------------------------------

const challengeSchema = z.object({ type: z.string(), domain: z.string(), value: z.string(), reason: z.string().optional().default("") });
const projectDomainSchema = z.object({
  name: z.string(),
  apexName: z.string(),
  projectId: z.string(),
  verified: z.boolean(),
  redirect: z.string().nullable().optional(),
  redirectStatusCode: z.number().nullable().optional(),
  verification: z.array(challengeSchema).optional(),
});
const domainConfigSchema = z.object({
  configuredBy: z.string().nullable().optional(),
  misconfigured: z.boolean(),
  acceptedChallenges: z.array(z.string()).optional(),
  recommendedIPv4: z.array(z.object({ rank: z.number(), value: z.array(z.string()) })).optional().default([]),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string() })).optional().default([]),
});
const errorSchema = z.object({ error: z.object({ code: z.string().optional(), message: z.string().optional() }) });

export type VercelChallenge = z.infer<typeof challengeSchema>;
export type VercelProjectDomain = z.infer<typeof projectDomainSchema>;
export type VercelDomainConfig = z.infer<typeof domainConfigSchema>;

export function parseProjectDomain(json: unknown): VercelProjectDomain | null {
  const r = projectDomainSchema.safeParse(json);
  return r.success ? r.data : null;
}
export function parseDomainConfig(json: unknown): VercelDomainConfig | null {
  const r = domainConfigSchema.safeParse(json);
  return r.success ? r.data : null;
}

export class VercelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
  /** 5xx, 429 and network errors are worth retrying later; 4xx are not. */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

// ---- Status mapping (pure) --------------------------------------------------------------

/**
 * Our edge state for a Vercel domain:
 *   verifying     Vercel needs the TXT challenge (domain used by another Vercel account)
 *   pending_dns   nothing points at Vercel yet (configuredBy null)
 *   misconfigured something points at Vercel but Vercel can't serve it / issue TLS yet
 *   active        configured and Vercel can issue the certificate (`misconfigured: false`)
 * Never "active" unless the API says verified AND not misconfigured.
 */
export type VercelDomainState = "pending_dns" | "verifying" | "misconfigured" | "active";

export function mapVercelState(domain: Pick<VercelProjectDomain, "verified">, config: Pick<VercelDomainConfig, "misconfigured" | "configuredBy"> | null): VercelDomainState {
  if (!domain.verified) return "verifying";
  if (!config) return "pending_dns";
  if (!config.misconfigured) return "active";
  return config.configuredBy ? "misconfigured" : "pending_dns";
}

export type DnsRecordPurpose = "ownership" | "routing" | "vercel-verification" | "redirect";
export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string; purpose: DnsRecordPurpose };

function rankFirst<T extends { rank: number }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => a.rank - b.rank)[0];
}

/** Routing record for one host: apex → A to the recommended IPv4, subdomain → CNAME to the recommended target. */
export function routingRecord(hostname: string, apexName: string, config: VercelDomainConfig | null, purpose: DnsRecordPurpose = "routing"): DnsRecord {
  const host = hostname.toLowerCase();
  if (host === apexName.toLowerCase()) {
    const ip = rankFirst(config?.recommendedIPv4 ?? [])?.value[0];
    return { type: "A", name: host, value: ip || VERCEL_FALLBACK_A, purpose };
  }
  const cname = rankFirst(config?.recommendedCNAME ?? [])?.value;
  return { type: "CNAME", name: host, value: (cname || VERCEL_FALLBACK_CNAME).replace(/\.$/, ""), purpose };
}

/** Vercel TXT challenges (only `type: TXT` is documented; others are passed through as TXT-less and ignored). */
export function challengeRecords(verification: VercelChallenge[] | undefined): DnsRecord[] {
  return (verification ?? []).filter((c) => c.type.toUpperCase() === "TXT").map((c) => ({ type: "TXT" as const, name: c.domain, value: c.value, purpose: "vercel-verification" as const }));
}

/** apex ↔ www companion for redirect handling, or null for any other subdomain. */
export function companionHostname(hostname: string, apexName: string): string | null {
  const host = hostname.toLowerCase();
  const apex = apexName.toLowerCase();
  if (host === apex) return `www.${apex}`;
  if (host === `www.${apex}`) return apex;
  return null;
}

// ---- Network ----------------------------------------------------------------------------

async function call(cfg: VercelConfig, method: "GET" | "POST" | "DELETE", path: string, opts: { body?: unknown; query?: Record<string, string> } = {}): Promise<unknown> {
  const url = new URL(path, VERCEL_API);
  if (cfg.teamId) url.searchParams.set("teamId", cfg.teamId);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await (cfg.fetchImpl ?? fetch)(url, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch (err) {
    throw new VercelApiError(err instanceof Error && err.name === "TimeoutError" ? "Vercel API timed out" : "Couldn't reach the Vercel API", 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const e = errorSchema.safeParse(json);
    throw new VercelApiError(e.success ? (e.data.error.message ?? `Vercel API ${res.status}`) : `Vercel API ${res.status}`, res.status, e.success ? (e.data.error.code ?? null) : null);
  }
  return json;
}

const enc = encodeURIComponent;
const projectPath = (cfg: VercelConfig) => `/projects/${enc(cfg.projectId)}`;

function expectDomain(json: unknown): VercelProjectDomain {
  const d = parseProjectDomain(json);
  if (!d) throw new VercelApiError("Unexpected Vercel response", 502);
  return d;
}

export async function getProjectDomain(cfg: VercelConfig, domain: string): Promise<VercelProjectDomain | null> {
  try {
    return expectDomain(await call(cfg, "GET", `/v9${projectPath(cfg)}/domains/${enc(domain)}`));
  } catch (err) {
    if (err instanceof VercelApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Adds the domain to the project (optionally as a redirect to another project domain).
 * Idempotent: Vercel answers 400/409 when it is already on a project; if it is on OUR project
 * the existing record is returned, otherwise the error is rethrown (e.g. another Vercel project).
 */
export async function addProjectDomain(cfg: VercelConfig, domain: string, opts: { redirect?: string; redirectStatusCode?: 301 | 302 | 307 | 308 } = {}): Promise<VercelProjectDomain> {
  const body: Record<string, unknown> = { name: domain };
  if (opts.redirect) {
    body.redirect = opts.redirect;
    body.redirectStatusCode = opts.redirectStatusCode ?? 308;
  }
  try {
    return expectDomain(await call(cfg, "POST", `/v10${projectPath(cfg)}/domains`, { body }));
  } catch (err) {
    if (err instanceof VercelApiError && (err.status === 400 || err.status === 409)) {
      const existing = await getProjectDomain(cfg, domain).catch(() => null);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Re-checks the TXT challenge. Vercel answers 400 while the TXT record is missing/wrong: returns the current record then. */
export async function verifyProjectDomain(cfg: VercelConfig, domain: string): Promise<VercelProjectDomain | null> {
  try {
    return expectDomain(await call(cfg, "POST", `/v9${projectPath(cfg)}/domains/${enc(domain)}/verify`));
  } catch (err) {
    if (err instanceof VercelApiError && err.status === 400) return getProjectDomain(cfg, domain);
    if (err instanceof VercelApiError && err.status === 404) return null;
    throw err;
  }
}

/** Removes the domain (and, by default, domains on the project that redirect to it). A 404 counts as success. */
export async function removeProjectDomain(cfg: VercelConfig, domain: string, opts: { removeRedirects?: boolean } = {}): Promise<void> {
  try {
    await call(cfg, "DELETE", `/v9${projectPath(cfg)}/domains/${enc(domain)}`, { body: { removeRedirects: opts.removeRedirects ?? true } });
  } catch (err) {
    if (err instanceof VercelApiError && err.status === 404) return;
    throw err;
  }
}

export async function getDomainConfig(cfg: VercelConfig, domain: string): Promise<VercelDomainConfig> {
  const json = await call(cfg, "GET", `/v6/domains/${enc(domain)}/config`, { query: { projectIdOrName: cfg.projectId } });
  const c = parseDomainConfig(json);
  if (!c) throw new VercelApiError("Unexpected Vercel response", 502);
  return c;
}

export type VercelDomainStatus = {
  hostname: string;
  apexName: string;
  verified: boolean;
  state: VercelDomainState;
  /** Records the seller must create (routing + any Vercel TXT challenge). */
  records: DnsRecord[];
  config: VercelDomainConfig | null;
};

/**
 * Full status for one project domain: runs `verify` when Vercel still needs the TXT challenge,
 * then reads the DNS config. Returns null when the domain isn't on the project.
 */
export async function inspectProjectDomain(cfg: VercelConfig, domain: string): Promise<VercelDomainStatus | null> {
  let d = await getProjectDomain(cfg, domain);
  if (!d) return null;
  if (!d.verified) d = (await verifyProjectDomain(cfg, domain)) ?? d;
  const config = await getDomainConfig(cfg, domain);
  const state = mapVercelState(d, config);
  const records = [...challengeRecords(d.verification), routingRecord(d.name, d.apexName, config)];
  return { hostname: d.name, apexName: d.apexName, verified: d.verified, state, records, config };
}
