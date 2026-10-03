/**
 * Date helpers for dashboard reporting. Stores are India-only (timezone Asia/Kolkata,
 * UTC+05:30, no DST), so day boundaries are computed with a fixed offset. Pure module.
 */

export const IST_OFFSET_MINUTES = 330;
const OFFSET_MS = IST_OFFSET_MINUTES * 60_000;
const DAY_MS = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of the IST calendar day containing `d`. */
export function istDateKey(d: Date | string): string {
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of IST midnight at the start of the given date key. */
export function istDayStart(key: string): Date {
  if (!DATE_KEY.test(key)) throw new RangeError(`Invalid date key: ${key}`);
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - OFFSET_MS);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive list of date keys from..to. */
export function eachDay(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let k = fromKey; k <= toKey && out.length < 1000; k = addDays(k, 1)) out.push(k);
  return out;
}

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && DATE_KEY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
}

/** `<input type="datetime-local">` value interpreted as IST → ISO instant. Null when blank/invalid. */
export function istLocalToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}.000Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t - OFFSET_MS).toISOString();
}

/** ISO instant → IST `datetime-local` value ("YYYY-MM-DDTHH:mm"). */
export function isoToIstLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + OFFSET_MS).toISOString().slice(0, 16);
}

export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateRange = {
  preset: RangePreset;
  fromKey: string;
  toKey: string;
  /** Inclusive start instant (IST midnight of fromKey). */
  fromIso: string;
  /** Exclusive end instant (IST midnight after toKey). */
  toIsoExclusive: string;
  days: number;
  label: string;
};

export const MAX_RANGE_DAYS = 366;

/**
 * Resolves a report date range from query params. Invalid input falls back to the last 30
 * days; custom ranges are clamped to MAX_RANGE_DAYS and never extend past today.
 */
export function resolveDateRange(input: { range?: string | null; from?: string | null; to?: string | null }, now: Date = new Date()): DateRange {
  const today = istDateKey(now);
  let preset: RangePreset = (RANGE_PRESETS as readonly string[]).includes(input.range ?? "") ? (input.range as RangePreset) : "30d";
  let fromKey: string;
  let toKey = today;
  if (preset === "custom") {
    if (isDateKey(input.from) && isDateKey(input.to) && input.from <= input.to) {
      fromKey = input.from;
      toKey = input.to > today ? today : input.to;
      if (fromKey > toKey) fromKey = toKey;
      const minFrom = addDays(toKey, -(MAX_RANGE_DAYS - 1));
      if (fromKey < minFrom) fromKey = minFrom;
    } else {
      preset = "30d";
      fromKey = addDays(today, -29);
    }
  } else {
    const n = preset === "today" ? 1 : Number.parseInt(preset, 10);
    fromKey = addDays(today, -(n - 1));
  }
  const days = eachDay(fromKey, toKey).length;
  const label =
    preset === "today" ? "Today" : preset === "custom" ? `${fromKey} to ${toKey}` : `Last ${days} days`;
  return {
    preset,
    fromKey,
    toKey,
    fromIso: istDayStart(fromKey).toISOString(),
    toIsoExclusive: istDayStart(addDays(toKey, 1)).toISOString(),
    days,
    label,
  };
}

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const shortDayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** "24 Sept 2026, 3:30 pm" in IST; "—" for blank/invalid input. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : dateTimeFmt.format(t);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : dateFmt.format(t);
}

/** Date key ("2026-09-24") → "24 Sept" (chart axis labels). */
export function formatDayKey(key: string): string {
  return isDateKey(key) ? shortDayFmt.format(Date.parse(`${key}T00:00:00Z`)) : key;
}
