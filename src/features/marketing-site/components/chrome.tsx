import Link from "next/link";
import { PLATFORM_NAME } from "@/config/platform";
import { FOOTER_GROUPS, LOGIN_HREF, NAV_LINKS, SECTION_IDS, SIGNUP_HREF } from "../content";
import { analyticsAttributes } from "../analytics";

export const ctaPrimary = "inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const ctaSecondary = "inline-flex h-11 items-center justify-center rounded-full border border-border bg-surface px-6 text-sm font-semibold transition hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <a href={`#${SECTION_IDS.main}`} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="font-display text-xl tracking-tight">
          {PLATFORM_NAME}
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-7 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-foreground" {...analyticsAttributes("nav_click", l.label, "header")}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <Link href={LOGIN_HREF} className="hidden text-sm font-medium sm:inline">
            Log in
          </Link>
          <Link href={SIGNUP_HREF} className={`${ctaPrimary} h-9 px-4`} {...analyticsAttributes("cta_click", "start", "header")}>
            Start free
          </Link>
        </div>
      </div>
      <nav aria-label="Main (mobile)" className="border-t border-border/60 md:hidden">
        <ul className="mx-auto flex max-w-6xl justify-around px-4 py-2 text-sm">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-muted hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-2xl">{PLATFORM_NAME}</p>
          <p className="mt-3 max-w-xs text-sm text-muted">E-commerce built for Indian fashion labels — from first kurta to festive rush.</p>
        </div>
        {FOOTER_GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="text-sm font-semibold">{g.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-border py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} {PLATFORM_NAME}. Made in India.
      </p>
    </footer>
  );
}
