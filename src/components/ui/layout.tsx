import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? <div className="mb-2 text-small text-muted">{back}</div> : null}
        <h1 className="truncate text-h1">{title}</h1>
        {description ? <p className="mt-1 text-body text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface shadow-xs", className)}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-h3">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-caption text-muted">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const BADGE_TONES = {
  neutral: "bg-surface-secondary text-muted ring-border",
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/20",
  error: "bg-error/10 text-error ring-error/20",
  accent: "bg-accent-soft text-accent ring-accent/20",
  info: "bg-info/10 text-info ring-info/20",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-medium whitespace-nowrap ring-1 ring-inset", BADGE_TONES[tone])}>{children}</span>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <p className="text-small text-muted">{label}</p>
      <p className="mt-1 text-h1 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}

/** Responsive table wrapper: scrolls horizontally on small screens instead of breaking layout. */
export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-xs">
      <table className="w-full min-w-[640px] text-left text-body">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}
export const th = "border-b border-border bg-surface-secondary/60 px-4 py-2.5 text-caption font-medium text-muted";
export const td = "border-b border-border px-4 py-3 align-middle [tr:last-child>&]:border-b-0";
