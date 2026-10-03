import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildMarketingMetadata } from "@/features/marketing-site/seo";
import { siteOrigin } from "@/features/marketing-site/site";
import { filterThemes, parseThemeQuery, themeIndustries, themesHref } from "@/features/marketing-site/themes";
import { livePreviewUrls } from "@/features/marketing-site/server/themes";
import { ThemeCard } from "@/features/marketing-site/components/theme-card";
import { ButtonLink, Container } from "@/features/marketing-site/components/ui";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";
import { industryName } from "@/features/stores/industries";

export async function generateMetadata({ searchParams }: PageProps<"/themes">): Promise<Metadata> {
  const q = parseThemeQuery(await searchParams);
  const meta = buildMarketingMetadata({
    title: q.industry ? `${industryName(q.industry)} themes` : "Themes",
    description: `Browse ${MARKETPLACE_THEMES.length} store themes for fashion, jewellery, beauty, home, food, electronics and more. Preview each on a demo store, then use it for yours.`,
    path: q.industry ? `/themes?industry=${q.industry}` : "/themes",
    origin: siteOrigin(),
  });
  // Search result pages are useful to visitors but thin for search engines.
  return q.q || q.page > 1 ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function ThemesPage({ searchParams }: PageProps<"/themes">) {
  const query = parseThemeQuery(await searchParams);
  const industries = themeIndustries();
  const result = filterThemes(query);
  const previews = await livePreviewUrls(result.items);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft/70 to-white pt-14 pb-8 sm:pt-20" aria-labelledby="themes-title">
        <Container>
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Theme marketplace</p>
            <h1 id="themes-title" className="mt-3 font-brand text-4xl font-extrabold tracking-tight text-brand-ink sm:text-5xl">
              Find a theme for your store
            </h1>
            <p className="mt-4 text-lg text-muted">
              {MARKETPLACE_THEMES.length} themes across {industries.length} business categories. Preview any theme on a demo store; previews never change a real store.
            </p>
          </div>
          <form role="search" action="/themes" method="get" className="mt-8 flex max-w-xl gap-2">
            {query.industry ? <input type="hidden" name="industry" value={query.industry} /> : null}
            <label htmlFor="theme-search" className="sr-only">
              Search themes
            </label>
            <div className="relative flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input
                id="theme-search"
                name="q"
                type="search"
                defaultValue={query.q}
                placeholder="Search by name, style or product type"
                className="h-12 w-full rounded-full border border-border-strong bg-white pl-11 pr-4 text-[0.95rem] text-brand-ink placeholder:text-subtle focus:border-brand focus:outline-2 focus:outline-brand/30"
              />
            </div>
            <button type="submit" className="h-12 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Search
            </button>
          </form>
        </Container>
      </section>

      <Container className="pb-20">
        <nav aria-label="Theme categories" className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            <li>
              <Link href={themesHref({ q: query.q })} aria-current={!query.industry ? "page" : undefined} className={chip(!query.industry)}>
                All <span className="opacity-70">{MARKETPLACE_THEMES.length}</span>
              </Link>
            </li>
            {industries.map((i) => (
              <li key={i.slug}>
                <Link href={themesHref({ q: query.q, industry: i.slug })} aria-current={query.industry === i.slug ? "page" : undefined} className={chip(query.industry === i.slug)}>
                  {i.label} <span className="opacity-70">{i.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-6 text-sm text-muted" role="status">
          {result.total === 0 ? "No themes found" : `${result.total} ${result.total === 1 ? "theme" : "themes"}`}
          {query.q ? ` for “${query.q}”` : ""}
          {query.industry ? ` in ${industryName(query.industry)}` : ""}
        </p>

        {result.total === 0 ? (
          <div className="mt-8 rounded-brand-lg border border-dashed border-border-strong bg-brand-canvas px-6 py-14 text-center">
            <p className="font-brand text-lg font-bold text-brand-ink">No themes match your search</p>
            <p className="mt-2 text-sm text-muted">Try a different word, or browse every category.</p>
            <ButtonLink href="/themes" variant="secondary" className="mt-6">
              Clear filters
            </ButtonLink>
          </div>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((t) => (
              <li key={t.key} className="h-full">
                <ThemeCard theme={t} previewUrl={previews.get(t.key) ?? null} headingLevel="h2" location="themes_page" />
              </li>
            ))}
          </ul>
        )}

        {result.pages > 1 ? (
          <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-2">
            {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
              <Link key={p} href={themesHref({ ...query, page: p })} aria-current={p === result.page ? "page" : undefined} className={cn("grid size-10 place-items-center rounded-full text-sm font-semibold", p === result.page ? "bg-brand text-white" : "border border-border text-brand-ink hover:border-brand")}>
                <span className="sr-only">Page </span>
                {p}
              </Link>
            ))}
          </nav>
        ) : null}
      </Container>
    </>
  );
}

function chip(active: boolean) {
  return cn(
    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    active ? "border-brand bg-brand text-white" : "border-border bg-white text-brand-ink hover:border-brand hover:text-brand",
  );
}
