import { toMinor } from "@/lib/money";

/**
 * Pure aggregation helpers for the super-admin dashboards (unit tested).
 * All bucketing is done in UTC so results don't depend on the server's timezone.
 */

const DAY_MS = 86_400_000;

export type SeriesPoint = { key: string; label: string; value: number };

const dayLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type BucketWindow = { key: string; label: string; start: string; end: string };

/**
 * `buckets` consecutive windows of `bucketDays` days, the last one ending at the end of
 * today (UTC), oldest first. `start` is inclusive and `end` exclusive (ISO timestamps).
 */
export function bucketWindows(opts: { buckets: number; bucketDays: number; now?: Date }): BucketWindow[] {
  const buckets = Math.max(1, Math.floor(opts.buckets));
  const span = Math.max(1, Math.floor(opts.bucketDays)) * DAY_MS;
  const end = utcMidnight(opts.now ?? new Date()) + DAY_MS;
  const first = end - buckets * span;
  return Array.from({ length: buckets }, (_, i) => {
    const s = new Date(first + i * span);
    return { key: s.toISOString().slice(0, 10), label: dayLabel.format(s), start: s.toISOString(), end: new Date(first + (i + 1) * span).toISOString() };
  });
}

/** Counts timestamps into the windows from bucketWindows(). Invalid or out-of-window values are ignored. */
export function bucketCounts(timestamps: readonly (string | null | undefined)[], opts: { buckets: number; bucketDays: number; now?: Date }): SeriesPoint[] {
  const windows = bucketWindows(opts);
  const points: SeriesPoint[] = windows.map((w) => ({ key: w.key, label: w.label, value: 0 }));
  const start = Date.parse(windows[0]!.start);
  const end = Date.parse(windows[windows.length - 1]!.end);
  const span = (end - start) / windows.length;
  for (const t of timestamps) {
    if (!t) continue;
    const ms = Date.parse(t);
    if (!Number.isFinite(ms) || ms < start || ms >= end) continue;
    points[Math.floor((ms - start) / span)]!.value++;
  }
  return points;
}

/** First day (YYYY-MM-01) of the last `count` months including the current one, oldest first. */
export function recentMonthStarts(count: number, now: Date = new Date()): string[] {
  const n = Math.max(1, Math.floor(count));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - (n - 1 - i), 1)).toISOString().slice(0, 10));
}

export type UsageRow = { metric: string; period_start: string; value: number | string };
export type MonthlyUsage = { month: string; label: string; gmvMinor: number; orders: number };

/**
 * Sums `tenant_usage` rows (gmv in rupees, orders as a count) per month for the given month
 * starts. Rows for other months/metrics are ignored; malformed values count as 0.
 */
export function usageByMonth(rows: readonly UsageRow[], months: readonly string[]): MonthlyUsage[] {
  const byMonth = new Map(months.map((m) => [m, { month: m, label: monthLabel.format(new Date(`${m}T00:00:00Z`)), gmvMinor: 0, orders: 0 }]));
  for (const r of rows) {
    const bucket = byMonth.get(r.period_start.slice(0, 10));
    if (!bucket) continue;
    if (r.metric === "gmv") bucket.gmvMinor += safeMinor(r.value);
    else if (r.metric === "orders") bucket.orders += safeCount(r.value);
  }
  return [...byMonth.values()];
}

function safeMinor(v: number | string): number {
  try {
    return toMinor(v);
  } catch {
    return 0;
  }
}

function safeCount(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Share of a plan limit used, as a whole percentage. null when there is no limit. May exceed 100. */
export function percentOfLimit(used: number, limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.round((used / limit) * 100);
}

export type SupportSessionState = { state: "active" | "expired" | "ended"; minutesLeft: number };

/** Support sessions expire on their own (the DB ignores them after expires_at); this mirrors that for the UI. */
export function supportSessionState(session: { ended_at: string | null; expires_at: string }, now: Date = new Date()): SupportSessionState {
  if (session.ended_at) return { state: "ended", minutesLeft: 0 };
  const left = Date.parse(session.expires_at) - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return { state: "expired", minutesLeft: 0 };
  return { state: "active", minutesLeft: Math.max(1, Math.ceil(left / 60_000)) };
}

/** Storage limit in bytes from a plan's `storage_mb` limit (null = unlimited). */
export function storageLimitBytes(limitMb: number | null | undefined): number | null {
  return limitMb === null || limitMb === undefined ? null : limitMb * 1024 * 1024;
}
