import { formatMoney, toMinor } from "@/lib/money";

/**
 * Display/format helpers shared by catalog pages and the editor (pure; unit tested).
 * PostgREST returns numeric(12,2) as a JS number of rupees: convert with `dbMoneyToMinor`
 * before any arithmetic.
 */

/** DB rupees (number | numeric string | null) -> integer paise, or null. */
export function dbMoneyToMinor(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  return toMinor(typeof v === "number" ? v : String(v));
}

/** Paise -> the text a seller would type: 149900 -> "1499", 149950 -> "1499.50". */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const whole = Math.trunc(minor / 100);
  const frac = Math.abs(minor % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

/** "₹1,499" or "₹1,499 – ₹2,999" or "—" when the product has no active variants. */
export function priceRangeLabel(minMinor: number | null, maxMinor: number | null): string {
  if (minMinor === null) return "—";
  if (maxMinor === null || maxMinor === minMinor) return formatMoney(minMinor);
  return `${formatMoney(minMinor)} – ${formatMoney(maxMinor)}`;
}

/** Integer quantity with Indian digit grouping (1,00,000). */
export function formatQty(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

/** Stock state for a variant row, mirroring public.inventory_overview(). */
export type StockState = "untracked" | "out" | "low" | "ok";
export function stockState(v: { trackInventory: boolean; available: number; threshold: number }): StockState {
  if (!v.trackInventory) return "untracked";
  if (v.available <= 0) return "out";
  if (v.available <= v.threshold) return "low";
  return "ok";
}

/** Escapes LIKE wildcards in user search text (for ilike "%q%"). */
export function likeEscape(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Trims search text and strips characters that would break a PostgREST logic tree. */
export function cleanSearch(q: string | undefined | null, max = 100): string {
  return (q ?? "").replace(/[(),"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
