import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** GET filter form for list pages (works without JavaScript; state lives in the URL). */
export function FilterBar({ action, resetHref, children, label = "Filters" }: { action: string; resetHref: string; children: ReactNode; label?: string }) {
  return (
    <form method="get" action={action} role="search" aria-label={label} className="mb-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm">
          Apply filters
        </Button>
        <Link href={resetHref} className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">
          Reset
        </Link>
      </div>
    </form>
  );
}

/** Builds a query string from defined values (for export links and pagination params). */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
