import type { ReactNode } from "react";

/** Vertical bars with a value label, for short series (months, weeks). Server component, no JS. */
export function ColumnChart({ points, format = (v) => String(v), height = 160, ariaLabel }: { points: { key: string; label: string; value: number }[]; format?: (v: number) => string; height?: number; ariaLabel: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <ol className="flex items-end gap-2" style={{ height }} aria-label={ariaLabel}>
      {points.map((p) => (
        <li key={p.key} className="group flex h-full flex-1 flex-col justify-end gap-1.5">
          <span className="text-center text-caption tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">{format(p.value)}</span>
          <span className="w-full rounded-t-sm bg-accent/75 transition-colors group-hover:bg-accent" style={{ height: `${p.value ? Math.max(4, (p.value / max) * (height - 44)) : 2}px` }} />
          <span className="text-center text-caption text-subtle">{p.label}</span>
          <span className="sr-only">
            {p.label}: {format(p.value)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Horizontal share bars (distribution by category). */
export function BarList({ items, format = (v) => String(v), tone = "accent" }: { items: { label: ReactNode; value: number; key: string }[]; format?: (v: number) => string; tone?: "accent" | "neutral" }) {
  const total = Math.max(1, items.reduce((s, i) => s + i.value, 0));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-small">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {format(i.value)} <span className="text-subtle">· {Math.round((i.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
            <div className={tone === "accent" ? "h-full rounded-full bg-accent" : "h-full rounded-full bg-muted"} style={{ width: `${(i.value / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
