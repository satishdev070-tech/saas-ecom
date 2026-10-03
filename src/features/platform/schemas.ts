import { z } from "zod";
import { email, pagination } from "@/lib/validation/common";
import { isValidStoreSlug } from "@/lib/tenant/host";
import { TENANT_STATUSES } from "@/lib/tenant/context";
import { PLATFORM_ROLES } from "@/lib/permissions/matrix";

/** Zod schemas for every super-admin form and list filter. Pure; shared by forms and server actions. */

const reason = z.string({ error: "A reason is required" }).trim().min(10, "Give a reason of at least 10 characters").max(500);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalUuid = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.uuid().optional());

// ---- Search -------------------------------------------------------------------------

/**
 * Makes free text safe to embed in a PostgREST `or=(…)` filter: drops the characters that
 * carry syntax there (`, ( ) " \ * % : `) and collapses whitespace. Result ≤ 80 chars.
 */
export function sanitizeSearchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[,()"\\*%:;{}[\]<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

export const tenantListFilterSchema = pagination.extend({
  q: z.preprocess(sanitizeSearchTerm, z.string()).optional(),
  status: z.enum(TENANT_STATUSES).optional().catch(undefined),
  plan: optionalUuid.catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const STORE_SORTS = ["newest", "oldest", "revenue", "orders", "products", "activity"] as const;
const isoDate = z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined), z.string().optional());

/** tenants.store_type (migration 1800): demo/showcase and test tenants vs real sellers. */
export const STORE_TYPES = ["real", "demo", "test"] as const;
export type StoreType = (typeof STORE_TYPES)[number];
export const STORE_TYPE_LABEL: Record<StoreType, string> = { real: "Real", demo: "Demo", test: "Test" };

/** A store_type value from the database, or null when absent/unknown (e.g. before migration 1800). */
export function parseStoreType(v: unknown): StoreType | null {
  return typeof v === "string" && (STORE_TYPES as readonly string[]).includes(v) ? (v as StoreType) : null;
}

/** /admin/stores filters: all applied server-side by platform_list_stores(). */
export const storeListFilterSchema = tenantListFilterSchema.extend({
  from: isoDate,
  to: isoDate,
  sort: z.enum(STORE_SORTS).catch("newest").default("newest"),
  type: z.enum(STORE_TYPES).optional().catch(undefined),
  category: optionalUuid.catch(undefined),
});
export type StoreListFilter = z.infer<typeof storeListFilterSchema>;

/**
 * True when a PostgREST/Postgres error means a function, table or column doesn't exist yet
 * (a migration not applied to this project), so callers can fall back to the older shape.
 */
export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return ["PGRST202", "PGRST200", "PGRST204", "PGRST205", "42883", "42P01", "42703"].includes(error?.code ?? "");
}

export const AUDIT_ACTOR_TYPES = ["user", "platform", "support", "system", "webhook"] as const;

export const auditFilterSchema = pagination.extend({
  tenant: optionalUuid.catch(undefined),
  action: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z_.]{1,60}$/)
    .optional()
    .catch(undefined),
  actor: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined), z.union([z.uuid(), z.email()]).optional()).catch(undefined),
  actorType: z.enum(AUDIT_ACTOR_TYPES).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ---- Tenants ------------------------------------------------------------------------

export const tenantIdSchema = z.object({ tenantId: z.uuid() });

export const tenantStatusSchema = z.object({
  tenantId: z.uuid(),
  status: z.enum(TENANT_STATUSES, { error: "Choose a status" }),
  reason,
  confirm: z.literal("yes", { error: "Confirm the change" }),
});

export const changePlanSchema = z.object({ tenantId: z.uuid(), planId: z.uuid({ error: "Choose a plan" }) });

export const extendTrialSchema = z.object({
  tenantId: z.uuid(),
  days: z.coerce.number({ error: "Enter a number of days" }).int().min(1, "At least 1 day").max(90, "At most 90 days"),
});

/** New trial end = later of (now, current end) + days. Never shortens a trial. */
export function extendedTrialEnd(currentEnd: string | null, days: number, now: Date = new Date()): Date {
  const base = currentEnd ? new Date(currentEnd) : now;
  const start = Number.isNaN(base.getTime()) || base < now ? now : base;
  return new Date(start.getTime() + days * 86_400_000);
}

export const createTenantSchema = z.object({
  ownerEmail: email,
  name: z.string().trim().min(2, "Enter the store name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidStoreSlug, "Use 3-63 lowercase letters, numbers or single hyphens (some names are reserved)"),
  planId: optionalUuid,
  status: z.enum(["trial", "active"]).default("trial"),
});

export const flagOverrideSchema = z.object({
  tenantId: z.uuid(),
  key: z.string().regex(/^[a-z0-9_.]{2,60}$/),
  /** "on" | "off" | "inherit" (inherit removes the override). */
  value: z.enum(["on", "off", "inherit"]),
});

export const SUPPORT_DURATIONS = [15, 30, 60, 120, 240] as const;
export const supportSessionSchema = z.object({
  tenantId: z.uuid(),
  reason,
  minutes: z.coerce
    .number({ error: "Choose a duration" })
    .int()
    .refine((m) => (SUPPORT_DURATIONS as readonly number[]).includes(m), "Choose a duration"),
});
export const endSupportSessionSchema = z.object({ sessionId: z.uuid(), tenantId: z.uuid() });

// ---- Plans --------------------------------------------------------------------------

/** Rupee amount as typed in a form ("999", "999.50") → validated decimal string. */
const rupees = z
  .string({ error: "Enter a price" })
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 999 or 999.50");

const limitField = z.preprocess(
  (v) => (v === undefined || v === "" ? null : v),
  z.coerce.number().int("Whole numbers only").min(0, "Can't be negative").max(10_000_000).nullable(),
);

export const PLAN_LIMIT_KEYS = ["products", "staff", "storage_mb", "custom_domains"] as const;

export const planSchema = z.object({
  id: optionalUuid,
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, "2-40 lowercase letters, numbers or underscores"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(300).optional()),
  priceMonthly: rupees,
  priceYearly: rupees,
  trialDays: z.coerce.number().int().min(0).max(90),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  active: checkbox,
  limit_products: limitField,
  limit_staff: limitField,
  limit_storage_mb: limitField,
  limit_custom_domains: limitField,
});
export type PlanInput = z.infer<typeof planSchema>;

/** Final shape of plans.limits / plans.features, validated again right before writing. */
export const planLimitsJsonSchema = z.partialRecord(z.enum(PLAN_LIMIT_KEYS), z.number().int().min(0).max(10_000_000));
export const planFeaturesJsonSchema = z.record(z.string().regex(/^[a-z0-9_.]{2,60}$/), z.boolean()).refine((r) => Object.keys(r).length <= 100, "Too many features");

/** Form values → plans.limits. Unlimited (blank) limits are omitted. */
export function planLimitsJson(input: PlanInput): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PLAN_LIMIT_KEYS) {
    const v = input[`limit_${k}`];
    if (v !== null && v !== undefined) out[k] = v;
  }
  return planLimitsJsonSchema.parse(out) as Record<string, number>;
}

/** Form field name for a plan's per-feature select ("inherit" | "on" | "off"). */
export const planFeatureField = (key: string) => `feature:${key}`;

/**
 * Plan feature selects → plans.features. Only catalogue keys are accepted; "inherit" (or
 * anything else) leaves the key out so the flag's platform default applies.
 */
export function planFeaturesFromForm(raw: Record<string, unknown>, catalogue: readonly string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of catalogue) {
    const v = raw[planFeatureField(key)];
    if (v === "on") out[key] = true;
    else if (v === "off") out[key] = false;
  }
  return planFeaturesJsonSchema.parse(out);
}

/** Current select value for a key in an existing plan's features JSON. */
export function planFeatureValue(features: unknown, key: string): "inherit" | "on" | "off" {
  if (!features || typeof features !== "object" || Array.isArray(features)) return "inherit";
  const v = (features as Record<string, unknown>)[key];
  return v === true ? "on" : v === false ? "off" : "inherit";
}

/** Numeric plan limit from a plans.limits JSON value (null = unlimited / unset). */
export function planLimitValue(limits: unknown, key: string): number | null {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return null;
  const v = (limits as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

export const planIdSchema = z.object({ id: z.uuid() });

// ---- Feature flags ------------------------------------------------------------------

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{2,60}$/, "2-60 lowercase letters, numbers, dots or underscores"),
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(200).optional()),
  defaultEnabled: checkbox,
});
export const flagKeySchema = z.object({ key: z.string().regex(/^[a-z0-9_.]{2,60}$/) });

// ---- Platform users -----------------------------------------------------------------

export const addPlatformUserSchema = z.object({ email, role: z.enum(PLATFORM_ROLES, { error: "Choose a role" }) });
export const updatePlatformUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(PLATFORM_ROLES),
  status: z.enum(["active", "disabled"]),
});

// ---- Domains (platform view) --------------------------------------------------------

export const domainFilterSchema = pagination.extend({
  q: z.preprocess(sanitizeSearchTerm, z.string()).optional(),
  status: z.enum(["pending", "verified", "failed", "removed"]).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
