import { z } from "zod";
import { formatMoney, toMinor } from "@/lib/money";

/**
 * Pure pricing helpers for the marketing site. Plan rows come from `public.plans`
 * (anon-readable when active). PostgREST returns numeric columns as JS numbers in rupees,
 * so every price is converted to integer paise with `toMinor()` before any arithmetic.
 */

export type BillingPeriod = "monthly" | "yearly";

export type PlanLimits = {
  products: number | null;
  staff: number | null;
  storageMb: number | null;
  customDomains: number | null;
};

export type PlanFeatures = {
  customDomains: boolean;
  blog: boolean;
  storeLocator: boolean;
  analyticsExport: boolean;
};

export type MarketingPlan = {
  code: string;
  name: string;
  description: string;
  monthlyMinor: number;
  yearlyMinor: number;
  currency: "INR";
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
};

/** Shape of the columns we select from `public.plans`. */
export type PlanRow = {
  code: string;
  name: string;
  description: string | null;
  price_monthly: number | string;
  price_yearly: number | string;
  currency: string;
  limits: unknown;
  features: unknown;
  trial_days: number;
  sort_order: number;
  active: boolean;
};

const optionalCount = z.number().int().nonnegative().nullable().catch(null);

const limitsSchema = z
  .object({
    products: optionalCount.optional(),
    staff: optionalCount.optional(),
    storage_mb: optionalCount.optional(),
    custom_domains: optionalCount.optional(),
  })
  .catch({});

const flag = z.boolean().catch(false);

const featuresSchema = z
  .object({
    custom_domains: flag.optional(),
    blog: flag.optional(),
    store_locator: flag.optional(),
    analytics_export: flag.optional(),
  })
  .catch({});

function safeMinor(value: number | string): number | null {
  try {
    const minor = toMinor(value);
    return minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}

/** Maps one DB row to a display model. Returns null for rows that cannot be priced safely. */
export function parsePlanRow(row: PlanRow): MarketingPlan | null {
  if (!row.active) return null;
  if (row.currency !== "INR") return null;
  const monthlyMinor = safeMinor(row.price_monthly);
  const yearlyMinor = safeMinor(row.price_yearly);
  if (monthlyMinor === null || yearlyMinor === null) return null;
  const name = row.name.trim();
  if (!name) return null;

  const limits = limitsSchema.parse(row.limits ?? {});
  const features = featuresSchema.parse(row.features ?? {});

  return {
    code: row.code,
    name,
    description: row.description?.trim() ?? "",
    monthlyMinor,
    yearlyMinor,
    currency: "INR",
    trialDays: Number.isInteger(row.trial_days) && row.trial_days > 0 ? row.trial_days : 0,
    limits: {
      products: limits.products ?? null,
      staff: limits.staff ?? null,
      storageMb: limits.storage_mb ?? null,
      customDomains: limits.custom_domains ?? null,
    },
    features: {
      customDomains: features.custom_domains ?? false,
      blog: features.blog ?? false,
      storeLocator: features.store_locator ?? false,
      analyticsExport: features.analytics_export ?? false,
    },
  };
}

/** Active, valid plans in display order. */
export function normalizePlans(rows: readonly PlanRow[]): MarketingPlan[] {
  return [...rows]
    .filter((r) => r.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    .map(parsePlanRow)
    .filter((p): p is MarketingPlan => p !== null);
}

/**
 * Mirror of the plans seeded in `supabase/migrations/20260924000600_reference_data.sql`.
 * Shown only when the database cannot be reached (e.g. a build without env), so the
 * page still renders; the route revalidates and picks up live prices afterwards.
 */
export const FALLBACK_PLANS: MarketingPlan[] = normalizePlans([
  {
    code: "starter",
    name: "Starter",
    description: "For new labels getting online",
    price_monthly: 999,
    price_yearly: 9990,
    currency: "INR",
    limits: { products: 200, staff: 2, storage_mb: 2048, custom_domains: 0 },
    features: { custom_domains: false, blog: true },
    trial_days: 14,
    sort_order: 1,
    active: true,
  },
  {
    code: "growth",
    name: "Growth",
    description: "For growing D2C brands",
    price_monthly: 2999,
    price_yearly: 29990,
    currency: "INR",
    limits: { products: 2000, staff: 8, storage_mb: 10240, custom_domains: 1 },
    features: { custom_domains: true, blog: true, store_locator: true },
    trial_days: 14,
    sort_order: 2,
    active: true,
  },
  {
    code: "scale",
    name: "Scale",
    description: "For established fashion houses",
    price_monthly: 7999,
    price_yearly: 79990,
    currency: "INR",
    limits: { products: 20000, staff: 30, storage_mb: 51200, custom_domains: 3 },
    features: { custom_domains: true, blog: true, store_locator: true, analytics_export: true },
    trial_days: 14,
    sort_order: 3,
    active: true,
  },
]);

/** Yearly price expressed per month, rounded to the nearest whole rupee for display. */
export function monthlyEquivalentMinor(yearlyMinor: number): number {
  return Math.round(yearlyMinor / 12 / 100) * 100;
}

/** Whole-percent saving of yearly billing vs 12 monthly payments (rounded down, never overstated). */
export function yearlySavingsPercent(monthlyMinor: number, yearlyMinor: number): number {
  const twelve = monthlyMinor * 12;
  if (twelve <= 0 || yearlyMinor >= twelve) return 0;
  return Math.floor(((twelve - yearlyMinor) / twelve) * 100);
}

/** Largest saving across plans, for the billing toggle label ("save up to 16%"). */
export function maxYearlySavingsPercent(plans: readonly MarketingPlan[]): number {
  return plans.reduce((max, p) => Math.max(max, yearlySavingsPercent(p.monthlyMinor, p.yearlyMinor)), 0);
}

/** Longest free trial offered, or 0 when no plan has one. */
export function maxTrialDays(plans: readonly MarketingPlan[]): number {
  return plans.reduce((max, p) => Math.max(max, p.trialDays), 0);
}

const countFormat = new Intl.NumberFormat("en-IN");

/** 2048 -> "2 GB", 51200 -> "50 GB", 500 -> "500 MB". */
export function formatStorage(mb: number): string {
  if (mb >= 1024) {
    const gb = Math.round((mb / 1024) * 10) / 10;
    return `${countFormat.format(gb)} GB`;
  }
  return `${countFormat.format(mb)} MB`;
}

function plural(n: number, one: string, many: string): string {
  return `${countFormat.format(n)} ${n === 1 ? one : many}`;
}

/** Human-readable plan inclusions derived from `limits` and `features` JSON. */
export function planHighlights(plan: MarketingPlan): string[] {
  const lines: string[] = [];
  const { limits, features } = plan;
  if (limits.products !== null) lines.push(`Up to ${plural(limits.products, "product", "products")}`);
  if (limits.staff !== null) lines.push(plural(limits.staff, "staff account", "staff accounts"));
  if (limits.storageMb !== null) lines.push(`${formatStorage(limits.storageMb)} media storage`);
  if (features.customDomains && (limits.customDomains ?? 0) > 0) {
    lines.push(plural(limits.customDomains ?? 0, "custom domain", "custom domains"));
  } else {
    lines.push("Free store subdomain");
  }
  if (features.blog) lines.push("Blog & lookbook journal");
  if (features.storeLocator) lines.push("Store locator page");
  if (features.analyticsExport) lines.push("Analytics CSV exports");
  return lines;
}

/** Code of the plan to visually recommend: the middle plan of three or more, else none. */
export function recommendedPlanCode(plans: readonly MarketingPlan[]): string | null {
  if (plans.length < 3) return null;
  return plans[Math.floor((plans.length - 1) / 2)]?.code ?? null;
}

export type PlanPriceView = {
  /** Headline amount, e.g. "₹2,999". */
  amount: string;
  /** Unit after the amount, e.g. "/month". */
  unit: string;
  /** Secondary line, e.g. "₹29,990 billed yearly". */
  note: string;
};

/** Everything the pricing card prints for one billing period. */
export function planPriceView(plan: MarketingPlan, period: BillingPeriod): PlanPriceView {
  if (period === "yearly") {
    return {
      amount: formatMoney(monthlyEquivalentMinor(plan.yearlyMinor)),
      unit: "/month",
      note: `${formatMoney(plan.yearlyMinor)} billed yearly`,
    };
  }
  return { amount: formatMoney(plan.monthlyMinor), unit: "/month", note: "Billed monthly" };
}
