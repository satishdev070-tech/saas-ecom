import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/features/marketing-site/components/brand-logo";
import { ONBOARDING_STEPS, stepIndex, type OnboardingStepKey } from "../steps";

/** Brand-styled frame for onboarding: logo, step progress and a centred card. */
export function OnboardingShell({ step, children, wide }: { step: OnboardingStepKey; children: ReactNode; wide?: boolean }) {
  const current = stepIndex(step);
  return (
    <div data-theme="light" className="theme-brand flex min-h-dvh flex-1 flex-col bg-brand-canvas">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandLogo />
          <Link href="/dashboard" className="text-sm font-semibold text-muted hover:text-brand-ink">
            Save and exit
          </Link>
        </div>
      </header>
      <nav aria-label="Setup progress" className="border-b border-border bg-white">
        <ol className="relative mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-4 sm:gap-4 sm:px-6">
          {ONBOARDING_STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.key} className="flex shrink-0 items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-xs font-bold",
                    done && "bg-brand text-white",
                    active && "bg-brand-soft text-brand ring-2 ring-brand",
                    !done && !active && "bg-brand-canvas text-muted ring-1 ring-border",
                  )}
                >
                  {done ? <Check aria-hidden className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-sm font-semibold", active ? "text-brand-ink" : "text-muted")}>
                  {s.label}
                  <span className="sr-only">{done ? " (done)" : active ? " (current step)" : ""}</span>
                </span>
                {i < ONBOARDING_STEPS.length - 1 ? <span aria-hidden className={cn("h-px w-6 sm:w-10", done ? "bg-brand" : "bg-border")} /> : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <main id="main" className="flex-1 px-4 py-10 sm:px-6">
        <div className={cn("mx-auto rounded-brand-lg border border-border bg-white p-6 shadow-brand-card sm:p-10", wide ? "max-w-5xl" : "max-w-xl")}>{children}</div>
      </main>
    </div>
  );
}

export function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>
      <h1 className="mt-2 font-brand text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 text-muted">{description}</p> : null}
    </div>
  );
}
