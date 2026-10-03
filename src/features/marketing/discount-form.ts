import { z } from "zod";
import { istLocalToIso } from "@/features/analytics/dates";
import { bool, intWithDefault, optionalInt, optionalRupees, rupeesOrZero, uuidList } from "@/features/settings/fields";

/**
 * Discount form parsing (pure). Produces a normalised shape that maps 1:1 to the
 * `discounts` table (+ discount_products / discount_collections), mirroring the DB checks
 * so sellers see field errors instead of constraint violations.
 */

export const DISCOUNT_TYPES = ["percentage", "fixed_amount", "free_shipping", "buy_x_get_y"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Percentage off",
  fixed_amount: "Fixed amount off",
  free_shipping: "Free shipping",
  buy_x_get_y: "Buy X get Y",
};
export const APPLIES_TO = ["all", "products", "collections"] as const;

/** Codes are stored uppercase: letters, digits, _ and -; 3–40 chars (DB check). */
export function normalizeDiscountCode(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}
const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

const raw = z.object({
  title: z.string({ error: "Enter a title" }).trim().min(1, "Enter a title").max(120),
  method: z.enum(["code", "automatic"]).default("code"),
  code: z.preprocess((v) => (typeof v === "string" ? normalizeDiscountCode(v) : v), z.string().optional()),
  type: z.enum(DISCOUNT_TYPES),
  percent: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().optional()),
  amount: optionalRupees,
  appliesTo: z.enum(APPLIES_TO).default("all"),
  productIds: uuidList(),
  collectionIds: uuidList(),
  minSubtotal: rupeesOrZero,
  maxDiscount: optionalRupees,
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  usageLimit: optionalInt(1, 10_000_000),
  perCustomerLimit: optionalInt(1, 1000),
  enabled: bool,
  buyQuantity: intWithDefault(1, 100, 2),
  getQuantity: intWithDefault(1, 100, 1),
  getPercent: intWithDefault(1, 100, 100),
});

export type DiscountInput = {
  title: string;
  code: string | null;
  automatic: boolean;
  type: DiscountType;
  /** percentage: whole percent (1–100); fixed_amount: paise; others: 0 */
  percent: number | null;
  amountMinor: number | null;
  appliesTo: (typeof APPLIES_TO)[number];
  productIds: string[];
  collectionIds: string[];
  minSubtotalMinor: number;
  maxDiscountMinor: number | null;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  status: "active" | "disabled";
  config: { buy_quantity: number; get_quantity: number; get_percent: number } | Record<string, never>;
};

export function discountFormSchema(now: Date = new Date()) {
  return raw.transform((v, ctx): DiscountInput => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const automatic = v.method === "automatic";
    let code: string | null = v.code ? v.code : null;
    if (!automatic) {
      if (!code) issue("code", "Enter a discount code");
      else if (!CODE_RE.test(code)) issue("code", "Use 3–40 letters, numbers, - or _");
    } else if (code && !CODE_RE.test(code)) {
      issue("code", "Use 3–40 letters, numbers, - or _");
    }
    if (automatic) code = code && CODE_RE.test(code) ? code : null;

    let percent: number | null = null;
    let amountMinor: number | null = null;
    if (v.type === "percentage") {
      if (v.percent === undefined || !Number.isInteger(v.percent) || v.percent < 1 || v.percent > 100) issue("percent", "Enter a whole percentage between 1 and 100");
      else percent = v.percent;
    } else if (v.type === "fixed_amount") {
      if (!v.amount || v.amount <= 0) issue("amount", "Enter an amount greater than 0");
      else amountMinor = v.amount;
    }

    if (v.appliesTo === "products" && v.productIds.length === 0) issue("productIds", "Choose at least one product");
    if (v.appliesTo === "collections" && v.collectionIds.length === 0) issue("collectionIds", "Choose at least one collection");

    const startsAt = v.startsAt ? istLocalToIso(v.startsAt) : now.toISOString();
    if (!startsAt) issue("startsAt", "Enter a valid start date");
    const endsAt = v.endsAt ? istLocalToIso(v.endsAt) : null;
    if (v.endsAt && !endsAt) issue("endsAt", "Enter a valid end date");
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) issue("endsAt", "End must be after the start");

    const maxDiscountMinor = v.type === "percentage" || v.type === "buy_x_get_y" ? v.maxDiscount : null;
    if (maxDiscountMinor !== null && maxDiscountMinor <= 0) issue("maxDiscount", "Enter an amount greater than 0");

    return {
      title: v.title,
      code,
      automatic,
      type: v.type,
      percent,
      amountMinor,
      appliesTo: v.appliesTo,
      productIds: v.appliesTo === "products" ? v.productIds : [],
      collectionIds: v.appliesTo === "collections" ? v.collectionIds : [],
      minSubtotalMinor: v.minSubtotal,
      maxDiscountMinor,
      startsAt: startsAt ?? now.toISOString(),
      endsAt,
      usageLimit: v.usageLimit,
      perCustomerLimit: v.perCustomerLimit,
      status: v.enabled ? "active" : "disabled",
      config: v.type === "buy_x_get_y" ? { buy_quantity: v.buyQuantity, get_quantity: v.getQuantity, get_percent: v.getPercent } : {},
    };
  });
}

/** DB `value` column: percent for percentage, rupees for fixed_amount, else 0. */
export function discountDbValue(input: Pick<DiscountInput, "type" | "percent" | "amountMinor">): number {
  if (input.type === "percentage") return input.percent ?? 0;
  if (input.type === "fixed_amount") return (input.amountMinor ?? 0) / 100;
  return 0;
}

export type DiscountStatusView = "active" | "scheduled" | "expired" | "disabled" | "exhausted";

/** Human status of a discount row at `now`. */
export function discountStatus(
  d: { status: string; starts_at: string; ends_at: string | null; usage_limit: number | null; usage_count: number },
  now: Date = new Date(),
): DiscountStatusView {
  if (d.status === "disabled") return "disabled";
  if (d.usage_limit !== null && d.usage_count >= d.usage_limit) return "exhausted";
  if (d.ends_at && Date.parse(d.ends_at) <= now.getTime()) return "expired";
  if (Date.parse(d.starts_at) > now.getTime()) return "scheduled";
  return "active";
}

/** Short human summary, e.g. "20% off · min ₹999". Money formatting injected to keep this pure. */
export function describeDiscount(
  d: { type: string; value: number; min_subtotal: number; max_discount: number | null; config: unknown },
  fmt: (minor: number) => string,
): string {
  const parts: string[] = [];
  if (d.type === "percentage") parts.push(`${d.value}% off`);
  else if (d.type === "fixed_amount") parts.push(`${fmt(Math.round(d.value * 100))} off`);
  else if (d.type === "free_shipping") parts.push("Free shipping");
  else if (d.type === "buy_x_get_y") {
    const c = (d.config ?? {}) as { buy_quantity?: number; get_quantity?: number; get_percent?: number };
    parts.push(`Buy ${c.buy_quantity ?? 2} get ${c.get_quantity ?? 1} ${c.get_percent === 100 || c.get_percent === undefined ? "free" : `at ${c.get_percent}% off`}`);
  }
  if (d.min_subtotal > 0) parts.push(`min ${fmt(Math.round(d.min_subtotal * 100))}`);
  if (d.max_discount) parts.push(`up to ${fmt(Math.round(d.max_discount * 100))}`);
  return parts.join(" · ");
}
