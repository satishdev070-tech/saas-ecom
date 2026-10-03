import { toMinor } from "@/lib/money";
import { addDays, eachDay, istDateKey, istDayStart } from "./dates";

/**
 * Pure aggregation for the dashboard home and analytics pages. All money is integer paise.
 * PostgREST returns numeric columns as JS numbers (rupees); convert with toMinor() first.
 */

export type OrderForMetrics = { grand_total: number | string; status: string; placed_at: string };

/**
 * An order counts as a sale unless it was cancelled or is still awaiting online payment
 * (status 'pending' = checkout started but not paid; it either becomes confirmed or expires).
 */
export function countsAsSale(status: string): boolean {
  return status !== "cancelled" && status !== "pending";
}

export type SalesWindow = { revenueMinor: number; orders: number; aovMinor: number };

function windowOf(orders: OrderForMetrics[], fromMs: number): SalesWindow {
  let revenueMinor = 0;
  let count = 0;
  for (const o of orders) {
    if (!countsAsSale(o.status)) continue;
    if (Date.parse(o.placed_at) < fromMs) continue;
    revenueMinor += toMinor(o.grand_total);
    count += 1;
  }
  return { revenueMinor, orders: count, aovMinor: count ? Math.round(revenueMinor / count) : 0 };
}

/** Today / last 7 days / last 30 days (IST calendar days, including today). */
export function salesSummary(orders: OrderForMetrics[], now: Date = new Date()): { today: SalesWindow; last7: SalesWindow; last30: SalesWindow } {
  const today = istDateKey(now);
  return {
    today: windowOf(orders, istDayStart(today).getTime()),
    last7: windowOf(orders, istDayStart(addDays(today, -6)).getTime()),
    last30: windowOf(orders, istDayStart(addDays(today, -29)).getTime()),
  };
}

export type DailyPoint = { date: string; revenueMinor: number; orders: number };

/** Revenue and order count per IST day, zero-filled across the whole range. */
export function dailySeries(orders: OrderForMetrics[], fromKey: string, toKey: string): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>(eachDay(fromKey, toKey).map((d) => [d, { date: d, revenueMinor: 0, orders: 0 }]));
  for (const o of orders) {
    if (!countsAsSale(o.status)) continue;
    const p = byDay.get(istDateKey(o.placed_at));
    if (!p) continue;
    p.revenueMinor += toMinor(o.grand_total);
    p.orders += 1;
  }
  return [...byDay.values()];
}

export type ItemForMetrics = { product_id: string | null; product_title: string; quantity: number; line_total: number | string };
export type TopProduct = { key: string; productId: string | null; title: string; units: number; revenueMinor: number };

/** Best sellers by revenue (ties broken by units, then title). Deleted products group by title. */
export function topProducts(items: ItemForMetrics[], limit = 10): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const it of items) {
    const key = it.product_id ?? `title:${it.product_title}`;
    const cur = map.get(key) ?? { key, productId: it.product_id, title: it.product_title, units: 0, revenueMinor: 0 };
    cur.units += it.quantity;
    cur.revenueMinor += toMinor(it.line_total);
    map.set(key, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.revenueMinor - a.revenueMinor || b.units - a.units || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export const FUNNEL_STEPS = ["page_view", "product_view", "add_to_cart", "begin_checkout", "purchase"] as const;
export type FunnelStepName = (typeof FUNNEL_STEPS)[number];
export const FUNNEL_LABELS: Record<FunnelStepName, string> = {
  page_view: "Visited store",
  product_view: "Viewed a product",
  add_to_cart: "Added to cart",
  begin_checkout: "Started checkout",
  purchase: "Purchased",
};

export type EventForMetrics = { event_name: string; session_id: string | null; path?: string | null };
export type FunnelStep = { step: FunnelStepName; label: string; sessions: number; fromPrevious: number | null; fromStart: number | null };

/**
 * Session-based funnel: each step counts distinct sessions that fired that event. Events
 * without a session id are counted individually. Rates are percentages with one decimal.
 */
export function conversionFunnel(events: EventForMetrics[]): FunnelStep[] {
  const sets = new Map<FunnelStepName, Set<string>>(FUNNEL_STEPS.map((s) => [s, new Set<string>()]));
  let anon = 0;
  for (const e of events) {
    const set = sets.get(e.event_name as FunnelStepName);
    if (!set) continue;
    set.add(e.session_id ?? `anon:${anon++}`);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const first = sets.get("page_view")!.size;
  return FUNNEL_STEPS.map((step, i) => {
    const sessions = sets.get(step)!.size;
    const prev = i === 0 ? null : sets.get(FUNNEL_STEPS[i - 1]!)!.size;
    return { step, label: FUNNEL_LABELS[step], sessions, fromPrevious: prev === null ? null : pct(sessions, prev), fromStart: i === 0 ? null : pct(sessions, first) };
  });
}

export type PathTraffic = { path: string; views: number; sessions: number };

/** Page views per path (query strings stripped), most viewed first. */
export function trafficByPath(events: EventForMetrics[], limit = 20): PathTraffic[] {
  const map = new Map<string, { views: number; sessions: Set<string> }>();
  let anon = 0;
  for (const e of events) {
    if (e.event_name !== "page_view") continue;
    const path = normalizePath(e.path);
    const cur = map.get(path) ?? { views: 0, sessions: new Set<string>() };
    cur.views += 1;
    cur.sessions.add(e.session_id ?? `anon:${anon++}`);
    map.set(path, cur);
  }
  return [...map.entries()]
    .map(([path, v]) => ({ path, views: v.views, sessions: v.sessions.size }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function normalizePath(p: string | null | undefined): string {
  if (!p) return "(unknown)";
  const clean = p.split(/[?#]/)[0]!.slice(0, 200);
  return clean.startsWith("/") ? clean : `/${clean}`;
}

/** Percentage change a→b rounded to 1 decimal; null when there is no baseline. */
export function percentChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Zero-fills a sparse per-day series (SQL returns only days with sales) across fromKey..toKey,
 * so a chart's x-axis always spans the full range.
 */
export function zeroFillDays<T extends { day: string; orders: number; revenueMinor: number }>(days: T[], fromKey: string, toKey: string): { day: string; orders: number; revenueMinor: number }[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return eachDay(fromKey, toKey).map((day) => {
    const d = byDay.get(day);
    return { day, orders: d?.orders ?? 0, revenueMinor: d?.revenueMinor ?? 0 };
  });
}
