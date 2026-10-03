import { z } from "zod";

/**
 * Environment contracts. Pure module (no `server-only`) so it can be unit tested.
 * Server code reads values through `@/lib/env/server`; browser code through
 * `@/lib/env/public`. Never add a secret to `publicEnvSchema`.
 */

const hostnameLike = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(localhost|([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/,
    "must be a bare hostname such as paliya.store or localhost (no scheme, port or path)",
  );

/**
 * The platform root domain. Accepts the usual paste mistakes (`https://www.example.in/`) and
 * reduces them to the bare apex: scheme, path/trailing slash and a leading `www.` are dropped
 * (`www.{root}` is always the platform, never the root itself). Ports and anything else that is
 * not a hostname are still rejected.
 */
const rootDomain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "").replace(/^www\./, ""))
  .pipe(hostnameLike);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  /** Supabase publishable (formerly "anon") key. Safe for the browser; RLS protects data. */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Root domain that hosts the platform, e.g. `paliya.store`. Stores live at `{slug}.{root}`. */
  NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN: rootDomain,
  /**
   * Full origin (scheme + host, no path) of the platform app, e.g. https://paliya.store. Used for
   * links in emails and OAuth callbacks (defaults from the root domain). Its host is also served
   * as the platform, so it may differ from the root domain (e.g. https://saas-ecom-puce.vercel.app).
   */
  NEXT_PUBLIC_PLATFORM_URL: z.url().optional(),
});

export const serverEnvSchema = publicEnvSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Supabase secret (formerly "service_role") key. Server-only, bypasses RLS. */
  SUPABASE_SECRET_KEY: z.string().min(20),
  /**
   * Shared secret between the Cloudflare domain-router Worker and this app.
   * Used to verify the signed forwarded-host header. Optional until the Worker is deployed;
   * when unset, the app trusts only the literal Host header.
   */
  EDGE_SHARED_SECRET: z.string().min(32).optional(),
  /**
   * Extra exact hostnames that serve the platform app (comma-separated, bare hostnames), e.g. a
   * Vercel production alias. Read by the proxy through lib/platform/hosts; validated here.
   */
  PLATFORM_HOST_ALIASES: z
    .string()
    .optional()
    .refine((v) => !v || v.split(",").every((h) => hostnameLike.safeParse(h).success), "must be comma-separated bare hostnames such as saas-ecom-puce.vercel.app"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /**
   * 32+ random chars. Root secret for HMAC-signed cart/session tokens and for encrypting
   * per-tenant payment credentials (keys are derived per purpose with HKDF; see lib/crypto.ts).
   */
  APP_SECRET: z.string().min(32),
  /** Bearer token required by /api/cron/* endpoints (Vercel Cron / Cloudflare Cron Triggers). */
  CRON_SECRET: z.string().min(24).optional(),
  /** Transactional email (Resend). When unset, emails are logged instead of sent. */
  RESEND_API_KEY: z.string().min(10).optional(),
  VERCEL_TOKEN: z.string().min(10).optional(),
  VERCEL_PROJECT_ID: z.string().min(3).optional(),
  VERCEL_TEAM_ID: z.string().min(3).optional(),
  EMAIL_FROM: z.string().min(3).default("The Paliya <no-reply@example.com>"),
  /** Cloudflare for SaaS custom hostnames (Phase 11). Optional until custom domains go live. */
  CLOUDFLARE_API_TOKEN: z.string().min(20).optional(),
  CLOUDFLARE_ZONE_ID: z.string().min(10).optional(),
  /** CNAME target customers point custom domains at, e.g. stores.paliya.store */
  CUSTOM_DOMAIN_CNAME_TARGET: hostnameLike.optional(),
  /**
   * Platform OAuth apps for the social hub (sellers connect their own accounts through them).
   * A network shows "Not configured" until both of its values are set.
   */
  META_APP_ID: z.string().min(5).optional(),
  META_APP_SECRET: z.string().min(10).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d{2}\.0$/).default("v25.0"),
  PINTEREST_APP_ID: z.string().min(3).optional(),
  PINTEREST_APP_SECRET: z.string().min(10).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(10).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(10).optional(),
  /**
   * Fallbacks only: the super admin normally enters these in Admin → Social apps (stored
   * encrypted in platform_app_credentials, which wins over env).
   */
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).max(200).optional(),
  GEMINI_API_KEY: z.string().min(10).optional(),
  GROQ_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

export function parseEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>): z.infer<S> {
  // Treat empty strings as unset so `.optional()` behaves as expected with blank .env lines.
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    // Report variable names and reasons only, never values.
    throw new EnvValidationError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return result.data;
}
