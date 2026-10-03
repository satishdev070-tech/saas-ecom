import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { analyticsAttributes, type AnalyticsEvent } from "../analytics";

/**
 * Shared marketing primitives (buttons, sections, headings). Colours come from the .theme-brand
 * tokens in globals.css; nothing here hard-codes a hex value.
 */

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60";
const sizes = { md: "h-11 px-6 text-sm", lg: "h-12 px-7 text-[0.95rem]", sm: "h-9 px-4 text-sm" } as const;
const variants = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border-strong bg-white text-brand-ink hover:border-brand hover:text-brand",
  light: "bg-white text-brand-ink hover:bg-brand-soft",
  ghostLight: "border border-white/40 text-white hover:bg-white/10",
} as const;

export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cn(base, sizes[size], variants[variant], extra);
}

type Track = { event?: AnalyticsEvent; id: string; location: string };

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  track,
  external,
  prefetch,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  track?: Track;
  external?: boolean;
  /** Pass false for links to route handlers that redirect (e.g. /themes/[key]/use). */
  prefetch?: boolean;
}) {
  const attrs = track ? analyticsAttributes(track.event ?? "cta_click", track.id, track.location) : {};
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)} {...attrs}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass(variant, size, className)} {...attrs}>
      {children}
    </Link>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({ id, children, className, labelledBy, tone = "white" }: { id?: string; children: ReactNode; className?: string; labelledBy?: string; tone?: "white" | "canvas" | "ink" }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-20 py-16 sm:py-20", tone === "canvas" && "bg-brand-canvas", tone === "ink" && "bg-brand-ink text-white", className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "light" }) {
  return <p className={cn("text-xs font-bold uppercase tracking-[0.14em]", tone === "brand" ? "text-brand" : "text-brand-accent")}>{children}</p>;
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  align = "center",
  as: As = "h2",
  tone = "dark",
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "center" | "left";
  as?: "h1" | "h2";
  tone?: "dark" | "light";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow tone={tone === "light" ? "light" : "brand"}>{eyebrow}</Eyebrow> : null}
      <As id={id} className={cn("mt-3 font-brand font-bold tracking-tight text-balance", As === "h1" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl", tone === "dark" ? "text-brand-ink" : "text-white")}>
        {title}
      </As>
      {body ? <p className={cn("mt-4 text-lg leading-relaxed", tone === "dark" ? "text-muted" : "text-white/80")}>{body}</p> : null}
    </div>
  );
}

/** Small "Demo data" chip for illustrative product visuals. */
export function DemoBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-brand-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-ink", className)}>Demo data</span>;
}
