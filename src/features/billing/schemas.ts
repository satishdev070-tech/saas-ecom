import { z } from "zod";

/** Plan requests and activation (pure; shared by forms, actions and tests). */

const note = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(500).optional());

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const requestPlanSchema = z.object({
  planId: z.uuid({ error: "Choose a plan" }),
  cycle: z.enum(BILLING_CYCLES).default("monthly"),
  note,
});

export const cancelPlanRequestSchema = z.object({ requestId: z.uuid() });

export const decidePlanRequestSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["approve", "decline"]),
  note,
  months: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().min(1).max(60).optional()),
});

/** Platform: put a store on a paid plan directly (no request needed). */
export const activatePlanSchema = z.object({
  tenantId: z.uuid(),
  planId: z.uuid({ error: "Choose a plan" }),
  reason: z.string({ error: "A reason is required" }).trim().min(10, "Give a reason of at least 10 characters").max(500),
});

export const PLAN_REQUEST_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type PlanRequestStatus = (typeof PLAN_REQUEST_STATUSES)[number];

/** "Upgrade" / "Downgrade" / "Activate" / "Change" relative to the current plan's monthly price. */
export function requestKind(current: { priceMonthly: number } | null, target: { priceMonthly: number }, trialOrSuspended: boolean): "upgrade" | "downgrade" | "activate" | "change" {
  if (!current) return "activate";
  if (target.priceMonthly > current.priceMonthly) return "upgrade";
  if (target.priceMonthly < current.priceMonthly) return "downgrade";
  return trialOrSuspended ? "activate" : "change";
}

/** Yearly saving vs 12 monthly payments, in whole percent (0 when none). */
export function yearlySavingPercent(priceMonthly: number, priceYearly: number): number {
  if (priceMonthly <= 0 || priceYearly <= 0) return 0;
  const full = priceMonthly * 12;
  return priceYearly >= full ? 0 : Math.round(((full - priceYearly) / full) * 100);
}

/** Whole days from now until `iso` (negative once passed); null without a date. */
export function daysUntil(iso: string | null, now: number = Date.now()): number | null {
  return iso ? Math.ceil((Date.parse(iso) - now) / 86_400_000) : null;
}
