/** Pure helpers behind the marketing site's small animations (count-up metrics, sparklines). */

/** Cubic ease-out on [0, 1]; inputs outside the range are clamped. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Value shown at `progress` (0..1) of a count-up from `from` to `to`, rounded to `decimals`. */
export function countAt(from: number, to: number, progress: number, decimals = 0): number {
  const raw = from + (to - from) * easeOutCubic(progress);
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

export type MetricFormat = {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Indian digit grouping by default (1,00,000). */
  locale?: string;
};

/** Formats a metric such as 18.4 -> "₹18.4L" or 2140 -> "2,140". */
export function formatMetric(value: number, { prefix = "", suffix = "", decimals = 0, locale = "en-IN" }: MetricFormat = {}): string {
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return `${prefix}${number}${suffix}`;
}

/**
 * SVG path for a sparkline across a `width` x `height` box with `pad` inset.
 * Returns the line path and a closed area path for a soft fill. Flat series render mid-height.
 */
export function sparklinePaths(values: readonly number[], width: number, height: number, pad = 2): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad + step * i;
    const y = span === 0 ? height / 2 : pad + innerH - ((v - min) / span) * innerH;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = first && last ? `${line} L${last[0]} ${height - pad} L${first[0]} ${height - pad} Z` : "";
  return { line, area };
}
