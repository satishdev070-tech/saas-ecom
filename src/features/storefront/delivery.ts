import { toMinor } from "@/lib/money";

/**
 * Delivery & COD estimate for the product page (pure). Read-only: checkout (Agent C) prices
 * shipping authoritatively; this only tells the shopper what to expect for a PIN code.
 */

export type CodSettings = { enabled: boolean; feeMinor: number; minOrderMinor: number; maxOrderMinor: number | null };

export function readCodSettings(value: unknown): CodSettings {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const money = (x: unknown, fallback: number) => {
    if (typeof x !== "number" && typeof x !== "string") return fallback;
    try {
      const m = toMinor(typeof x === "number" ? x : x.trim());
      return m >= 0 ? m : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    enabled: v.enabled !== false,
    feeMinor: money(v.fee, 0),
    minOrderMinor: money(v.min_order, 0),
    maxOrderMinor: v.max_order === null || v.max_order === undefined ? null : money(v.max_order, 0) || null,
  };
}

export type ShippingRate = {
  name: string;
  priceMinor: number;
  minSubtotalMinor: number;
  maxSubtotalMinor: number | null;
  pincodePrefixes: string[];
  daysMin: number;
  daysMax: number;
  codAllowed: boolean;
};

export type PincodeRule = { deliverable: boolean; codAllowed: boolean; extraDays: number } | null;

export type DeliveryEstimate =
  | { deliverable: false; message: string }
  | {
      deliverable: true;
      daysMin: number;
      daysMax: number;
      shippingMinor: number;
      rateName: string;
      cod: { available: boolean; feeMinor: number; reason?: string };
    };

export function estimateDelivery(input: { pincode: string; subtotalMinor: number; rates: ShippingRate[]; rule: PincodeRule; cod: CodSettings }): DeliveryEstimate {
  const { pincode, subtotalMinor, rates, rule, cod } = input;
  if (!/^[1-9]\d{5}$/.test(pincode)) return { deliverable: false, message: "Enter a valid 6-digit PIN code." };
  if (rule && !rule.deliverable) return { deliverable: false, message: "Sorry, we don't deliver to this PIN code yet." };

  const applicable = rates.filter(
    (r) =>
      (r.pincodePrefixes.length === 0 || r.pincodePrefixes.some((p) => pincode.startsWith(p))) &&
      subtotalMinor >= r.minSubtotalMinor &&
      (r.maxSubtotalMinor === null || subtotalMinor <= r.maxSubtotalMinor),
  );
  if (applicable.length === 0) return { deliverable: false, message: "Sorry, we don't deliver to this PIN code yet." };
  // cheapest, then fastest
  const best = [...applicable].sort((a, b) => a.priceMinor - b.priceMinor || a.daysMax - b.daysMax)[0]!;
  const extra = Math.max(0, rule?.extraDays ?? 0);

  let codAvailable = cod.enabled && best.codAllowed && (rule?.codAllowed ?? true);
  let reason: string | undefined;
  if (!cod.enabled) reason = "Cash on delivery isn't offered by this store.";
  else if (!best.codAllowed || rule?.codAllowed === false) reason = "Cash on delivery isn't available for this PIN code.";
  else if (subtotalMinor < cod.minOrderMinor) {
    codAvailable = false;
    reason = "Cash on delivery is available on larger orders.";
  } else if (cod.maxOrderMinor !== null && subtotalMinor > cod.maxOrderMinor) {
    codAvailable = false;
    reason = "Cash on delivery isn't available for orders of this value.";
  }

  return {
    deliverable: true,
    daysMin: best.daysMin + extra,
    daysMax: best.daysMax + extra,
    shippingMinor: best.priceMinor,
    rateName: best.name,
    cod: { available: codAvailable, feeMinor: cod.feeMinor, reason: codAvailable ? undefined : reason },
  };
}

/** "Delivery by Tue, 1 Oct" style range from today (IST). */
export function deliveryDateRange(daysMin: number, daysMax: number, from = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const add = (d: number) => new Date(from.getTime() + d * 86_400_000);
  return daysMin === daysMax ? fmt.format(add(daysMin)) : `${fmt.format(add(daysMin))} – ${fmt.format(add(daysMax))}`;
}
