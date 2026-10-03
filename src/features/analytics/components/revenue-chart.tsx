import { formatMoney } from "@/lib/money";
import { formatDayKey } from "../dates";

type Point = { day: string; orders: number; revenueMinor: number };

/**
 * Daily revenue bars (server component, no JS). Expects a zero-filled series (see zeroFillDays)
 * so the x-axis always spans the whole range. Values are exposed to screen readers per day.
 */
export function RevenueChart({ days, height = "h-44" }: { days: Point[]; height?: string }) {
  const max = Math.max(1, ...days.map((d) => d.revenueMinor));
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto">
        <ol className={`flex ${height} min-w-[420px] items-end gap-[3px]`} aria-label="Revenue per day">
          {days.map((d) => (
            <li key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className={`rounded-t-sm ${d.revenueMinor ? "bg-accent/75 group-hover:bg-accent" : "bg-border/70"}`}
                style={{ height: d.revenueMinor ? `${Math.max(3, (d.revenueMinor / max) * 100)}%` : "2px" }}
              />
              <span className="sr-only">
                {formatDayKey(d.day)}: {formatMoney(d.revenueMinor)} from {d.orders} orders
              </span>
              <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                {formatDayKey(d.day)} · {formatMoney(d.revenueMinor)} · {d.orders} {d.orders === 1 ? "order" : "orders"}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {first && last ? (
        <figcaption className="flex justify-between text-xs text-muted">
          <span>{formatDayKey(first.day)}</span>
          <span>{formatDayKey(last.day)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
