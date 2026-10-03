import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Standard loading / empty / error states. Every dashboard page uses these (see DoD). */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-secondary", className)} />;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      {icon ? <div className="grid size-10 place-items-center rounded-lg bg-surface-secondary text-muted [&_svg]:size-5">{icon}</div> : null}
      <h2 className="text-h3">{title}</h2>
      {description ? <p className="max-w-md text-body text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-lg border border-error/30 bg-error/5 px-6 py-12 text-center">
      <h2 className="text-h3 text-error">{title}</h2>
      {description ? <p className="max-w-md text-body text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
