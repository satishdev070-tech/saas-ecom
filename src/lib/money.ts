/**
 * Money helpers. All arithmetic happens on integer minor units (paise) to avoid float
 * drift. Postgres stores numeric(12,2) and returns it as a string via PostgREST.
 */

export type CurrencyCode = "INR";

export function toMinor(amount: string | number): number {
  const str = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(str);
  if (!match) throw new RangeError(`Invalid money amount: ${JSON.stringify(amount)}`);
  const [, sign, whole, frac = ""] = match;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new RangeError("Money amount out of range");
  return sign ? -minor : minor;
}

/** Converts minor units to the decimal string Postgres numeric expects. */
export function toDecimalString(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError("Money amount must be an integer number of minor units");
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats for display, e.g. 129900 -> "₹1,299" (drops .00), 129950 -> "₹1,299.50". */
export function formatMoney(minor: number, currency: CurrencyCode = "INR", locale = "en-IN"): string {
  const whole = minor % 100 === 0;
  const key = `${locale}|${currency}|${whole}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    });
    formatters.set(key, fmt);
  }
  return fmt.format(minor / 100);
}

/** Percentage off MRP, rounded down so we never overstate a discount. Returns 0 when not discounted. */
export function discountPercent(priceMinor: number, compareAtMinor: number | null | undefined): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor || compareAtMinor <= 0) return 0;
  return Math.floor(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
