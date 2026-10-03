import { z } from "zod";

/**
 * Feature entitlements. Precedence for a tenant: explicit tenant override
 * (tenant_feature_flags) > plan feature (plans.features[key]) > flag default
 * (feature_flags.default_enabled). Unknown keys are off. Pure + unit tested; the raw
 * inputs come from the `tenant_entitlements(tenant)` SQL function.
 */

const boolRecord = z.record(z.string(), z.boolean()).catch({});

export const rawEntitlementsSchema = z.object({
  plan: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      features: z.record(z.string(), z.unknown()).catch({}),
      limits: z.record(z.string(), z.unknown()).catch({}),
    })
    .nullable()
    .catch(null),
  defaults: boolRecord,
  overrides: boolRecord,
});
export type RawEntitlements = z.infer<typeof rawEntitlementsSchema>;

export type FeatureSource = "override" | "plan" | "default" | "unknown";
export type ResolvedFeature = { enabled: boolean; source: FeatureSource };

export type Entitlements = {
  plan: { id: string; code: string; name: string } | null;
  features: Record<string, ResolvedFeature>;
  limits: Record<string, number | null>;
  isEnabled(key: string): boolean;
  /** Numeric plan limit; null = unlimited / not set. Negative or non-numeric values are treated as 0. */
  limit(key: string): number | null;
};

export function resolveFeature(key: string, raw: RawEntitlements): ResolvedFeature {
  if (key in raw.overrides) return { enabled: raw.overrides[key]!, source: "override" };
  const planValue = raw.plan?.features[key];
  if (typeof planValue === "boolean") return { enabled: planValue, source: "plan" };
  if (key in raw.defaults) return { enabled: raw.defaults[key]!, source: "default" };
  return { enabled: false, source: "unknown" };
}

function toLimit(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return 0;
}

export function resolveEntitlements(input: unknown): Entitlements {
  const raw = rawEntitlementsSchema.parse(input ?? {});
  const keys = new Set([...Object.keys(raw.defaults), ...Object.keys(raw.overrides), ...Object.keys(raw.plan?.features ?? {})]);
  const features: Record<string, ResolvedFeature> = {};
  for (const k of keys) features[k] = resolveFeature(k, raw);
  const limits: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw.plan?.limits ?? {})) limits[k] = toLimit(v);
  return {
    plan: raw.plan ? { id: raw.plan.id, code: raw.plan.code, name: raw.plan.name } : null,
    features,
    limits,
    isEnabled: (key) => resolveFeature(key, raw).enabled,
    limit: (key) => (key in limits ? limits[key]! : null),
  };
}
