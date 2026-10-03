/** Pure social-planner helpers (unit tested). No lunar festival dates: those vary yearly and need a calendar source. */
import type { ContentPillar } from "./compose";
import type { MarketingDate } from "./planner-types";

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Day of month of the nth given weekday (0 = Sunday) in a month (1-12). */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/** Built-in fixed-date and rule-based occasions for a year (sorted, not editable). */
export function builtInDates(year: number): MarketingDate[] {
  const blackFriday = new Date(Date.UTC(year, 10, nthWeekday(year, 11, 4, 4) + 1));
  const rows: [string, string, MarketingDate["kind"]][] = [
    ["New Year's Day", ymd(year, 1, 1), "festival"],
    ["Republic Day", ymd(year, 1, 26), "festival"],
    ["Valentine's Day", ymd(year, 2, 14), "festival"],
    ["Women's Day", ymd(year, 3, 8), "festival"],
    ["Mother's Day", ymd(year, 5, nthWeekday(year, 5, 0, 2)), "festival"],
    ["Father's Day", ymd(year, 6, nthWeekday(year, 6, 0, 3)), "festival"],
    ["Independence Day", ymd(year, 8, 15), "festival"],
    ["Teachers' Day", ymd(year, 9, 5), "festival"],
    ["Gandhi Jayanti", ymd(year, 10, 2), "festival"],
    ["Children's Day", ymd(year, 11, 14), "festival"],
    ["Black Friday", ymd(year, blackFriday.getUTCMonth() + 1, blackFriday.getUTCDate()), "sale"],
    ["Christmas", ymd(year, 12, 25), "festival"],
  ];
  return rows.map(([title, onDate, kind]) => ({ id: null, title, onDate, kind, notes: null, builtIn: true })).sort((a, b) => a.onDate.localeCompare(b.onDate));
}

/** Built-in dates whose day falls within [fromDay, toDay] (YYYY-MM-DD, inclusive). */
export function builtInDatesBetween(fromDay: string, toDay: string): MarketingDate[] {
  const out: MarketingDate[] = [];
  for (let y = Number(fromDay.slice(0, 4)); y <= Number(toDay.slice(0, 4)); y++) out.push(...builtInDates(y).filter((d) => d.onDate >= fromDay && d.onDate <= toDay));
  return out;
}

/** Calendar day (YYYY-MM-DD) of an instant in India Standard Time. */
export function istDayKey(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday 00:00 to next Monday 00:00 IST of the week containing `now`, as ISO instants. */
export function istWeekRange(now: Date = new Date()): { from: string; to: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const startIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow);
  return { from: new Date(startIst - IST_OFFSET_MS).toISOString(), to: new Date(startIst - IST_OFFSET_MS + 7 * DAY_MS).toISOString() };
}

/** Parses an ISO time or a "YYYY-MM-DDTHH:mm" local value (read as IST). Returns epoch ms or NaN. */
export function parseIstInput(s: string): number {
  const v = s.trim();
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+05:30` : v);
}

/** Posts per content pillar (posts without a pillar are not counted). */
export function pillarMix(posts: { pillar: ContentPillar | string | null }[]): Partial<Record<ContentPillar, number>> {
  const out: Partial<Record<ContentPillar, number>> = {};
  for (const p of posts) if (p.pillar) out[p.pillar as ContentPillar] = (out[p.pillar as ContentPillar] ?? 0) + 1;
  return out;
}

/** Store product link tagged for social traffic: {origin}/products/{slug}?utm_source=social&utm_medium=organic&utm_campaign=… */
export function buildUtmLink(origin: string, slug: string, campaign = "planner"): string {
  const url = new URL(`/products/${encodeURIComponent(slug)}`, origin.replace(/\/$/, "") + "/");
  url.searchParams.set("utm_source", "social");
  url.searchParams.set("utm_medium", "organic");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}
