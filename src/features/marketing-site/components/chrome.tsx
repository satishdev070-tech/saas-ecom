import Link from "next/link";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import { CTA_CREATE, FOOTER_GROUPS, LOGIN_HREF, NAV_LINKS, SECTION_IDS, SIGNUP_HREF } from "../content";
import { analyticsAttributes } from "../analytics";
import { BrandLogo } from "./brand-logo";
import { MobileNav } from "./mobile-nav";
import { ButtonLink, Container } from "./ui";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <a href={`#${SECTION_IDS.main}`} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-brand-card">
        Skip to content
      </a>
      <Container className="flex h-[72px] items-center justify-between gap-4 sm:h-20 sm:gap-6">
        <BrandLogo size="header" className="shrink-0" />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1 text-[0.95rem]">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="rounded-full px-4 py-2 font-medium text-brand-ink/80 hover:bg-brand-canvas hover:text-brand-ink" {...analyticsAttributes("nav_click", l.label, "header")}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href={LOGIN_HREF} className="hidden rounded-full px-4 py-2 text-[0.95rem] font-semibold text-brand-ink hover:bg-brand-canvas sm:inline-flex" {...analyticsAttributes("nav_click", "login", "header")}>
            Login
          </Link>
          <ButtonLink href={SIGNUP_HREF} size="sm" className="hidden h-10 whitespace-nowrap sm:inline-flex" track={{ id: "create_store", location: "header" }}>
            {CTA_CREATE}
          </ButtonLink>
          <MobileNav links={NAV_LINKS} loginHref={LOGIN_HREF} signupHref={SIGNUP_HREF} ctaLabel={CTA_CREATE} />
        </div>
      </Container>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-brand-ink text-white">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <BrandLogo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">{PLATFORM_TAGLINE}. Create your store, add your products and start selling.</p>
          <ButtonLink href={SIGNUP_HREF} variant="light" size="sm" className="mt-6" track={{ id: "create_store", location: "footer" }}>
            {CTA_CREATE}
          </ButtonLink>
        </div>
        {FOOTER_GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="text-sm font-semibold">{g.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="rounded hover:text-white focus-visible:outline-2 focus-visible:outline-brand-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-6 text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} {PLATFORM_NAME}
          </p>
          <p>Made in India</p>
        </Container>
      </div>
    </footer>
  );
}
