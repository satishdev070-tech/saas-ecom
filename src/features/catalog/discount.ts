/**
 * "% off MRP" helpers for the product editor (PURE, unit tested). Prices are the editor's rupee
 * strings; maths is done in paise so rounding never drifts.
 */
const paise = (v: string): number | null => {
  const t = v.replace(/[,₹\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
  const [r, p = ""] = t.split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0"));
};
const rupees = (p: number): string => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

/** Whole-number % off MRP ("" when there's no valid discount to show). */
export function discountPercent(price: string, mrp: string): string {
  const pr = paise(price);
  const m = paise(mrp);
  if (pr === null || m === null || m <= 0 || pr >= m) return "";
  return String(Math.round(((m - pr) / m) * 100));
}

/** Selling price for `pct`% off `mrp`, rounded to the nearest rupee; null if the inputs aren't valid. */
export function priceFromDiscount(mrp: string, pct: string): string | null {
  const m = paise(mrp);
  const d = Number(pct);
  if (m === null || m <= 0 || !/^\d{1,2}(\.\d+)?$/.test(pct.trim()) || d < 0 || d >= 100) return null;
  return rupees(Math.round((m * (100 - d)) / 100 / 100) * 100);
}
