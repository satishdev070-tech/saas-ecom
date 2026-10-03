import { Skeleton } from "@/components/ui/states";

/** Loading placeholders shared by dashboard list/detail/form pages. */

export function ListSkeleton({ filters = false, columns = 5, rows = 8 }: { filters?: boolean; columns?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-10 w-28 sm:block" />
      </div>
      {filters ? <Skeleton className="h-28" /> : null}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid gap-4 border-b border-border p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-3" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid gap-4 border-b border-border p-4 last:border-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, i) => (
              <Skeleton key={i} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ))}
    </div>
  );
}
