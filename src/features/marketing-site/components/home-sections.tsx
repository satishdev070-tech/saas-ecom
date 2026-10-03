import Link from "next/link";
import { ArrowRight, BarChart3, Check, CreditCard, Globe2, LayoutTemplate, PackageSearch, ReceiptText, Truck } from "lucide-react";
import type { MarketplaceTheme } from "@/features/theme/marketplace/types";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import { BENEFITS, CATEGORY_CARDS, CTA_CREATE, CTA_THEMES, HERO, HOW_IT_WORKS, SECTION_IDS, SIGNUP_HREF, THEMES_HREF, type BenefitKey, type Faq, type Step } from "../content";
import { themeCountFor, themeForIndustry, themesHref } from "../themes";
import { ButtonLink, Container, Section, SectionHeading } from "./ui";
import { ThemeCard, ThemeDevicePreview } from "./theme-card";
import { DESKTOP_VIEWPORT, LiveFrame } from "./live-frame";

const BENEFIT_ICONS: Record<BenefitKey, typeof Check> = {
  storefront: LayoutTemplate,
  catalogue: PackageSearch,
  orders: ReceiptText,
  payments: CreditCard,
  shipping: Truck,
  domains: Globe2,
  seo: BarChart3,
};

export function Hero({ theme, previewUrl, trialDays }: { theme: MarketplaceTheme | undefined; previewUrl: string | null; trialDays: number }) {
  const assurances = [
    trialDays > 0 ? `${trialDays}-day free trial, no card details` : "No card details to sign up",
    "UPI and cards through your own payment account, plus COD",
    "Free store address, custom domain on eligible plans",
  ];
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-soft/70 to-white" aria-labelledby="hero-title">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand shadow-brand-card">
            <span className="size-1.5 rounded-full bg-brand-accent" aria-hidden />
            {HERO.eyebrow}
          </p>
          <h1 id="hero-title" className="mt-5 font-brand text-4xl font-extrabold leading-[1.08] tracking-tight text-balance text-brand-ink sm:text-5xl lg:text-[3.6rem]">
            {HERO.headline}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">{HERO.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={SIGNUP_HREF} size="lg" track={{ id: "create_store", location: "hero" }}>
              {CTA_CREATE} <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink href={THEMES_HREF} variant="secondary" size="lg" track={{ id: "explore_themes", location: "hero" }}>
              {CTA_THEMES}
            </ButtonLink>
          </div>
          <ul className="mt-8 grid gap-2.5 text-sm text-brand-ink/85">
            {assurances.map((a) => (
              <li key={a} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-mint text-[#15803d]" aria-hidden>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
        {theme ? (
          <figure className="relative pb-8 lg:pl-6">
            <div className="absolute -inset-x-4 -top-6 bottom-2 -z-0 rounded-[40px] bg-brand-accent-soft" aria-hidden />
            <div className="relative">
              <ThemeDevicePreview theme={theme} previewUrl={previewUrl} size="large" eager />
            </div>
            <figcaption className="relative mt-10 text-center text-sm text-muted">
              Shown: the{" "}
              <Link href={`/themes/${theme.key}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                {theme.name}
              </Link>{" "}
              theme{previewUrl ? " on a live demo store" : ""}, with sample products.
            </figcaption>
          </figure>
        ) : null}
      </Container>
    </section>
  );
}

export function Benefits() {
  return (
    <Section id={SECTION_IDS.benefits} labelledBy="benefits-title">
      <SectionHeading id="benefits-title" eyebrow="Why Build Brighten" title="Everything you need to sell online" body="Set up a store, take orders and run your business from one dashboard." />
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b) => {
          const Icon = BENEFIT_ICONS[b.key];
          return (
            <li key={b.key} className="rounded-brand-lg border border-border bg-white p-6">
              <span className="grid size-11 place-items-center rounded-brand-md bg-brand-soft text-brand" aria-hidden>
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-brand text-lg font-bold text-brand-ink">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b.body}</p>
            </li>
          );
        })}
        <li className="flex flex-col justify-between rounded-brand-lg bg-brand p-6 text-white">
          <p className="font-brand text-lg font-bold">See every feature in detail</p>
          <Link href="/features" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
            Explore features <ArrowRight aria-hidden className="size-4" />
          </Link>
        </li>
      </ul>
    </Section>
  );
}

export function Categories({ previews }: { previews: Map<string, string> }) {
  return (
    <Section id={SECTION_IDS.categories} tone="canvas" labelledBy="categories-title">
      <SectionHeading id="categories-title" eyebrow="For every kind of business" title="Built for more than fashion" body="Themes are designed for different kinds of products, from jewellery to bakeries to electronics." />
      <ul className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        {CATEGORY_CARDS.map((c) => {
          const theme = themeForIndustry(c.industry);
          const count = themeCountFor(c.industry);
          return (
            <li key={c.industry}>
              <Link href={themesHref({ industry: c.industry as never })} className="group block h-full overflow-hidden rounded-brand-lg border border-border bg-white transition-shadow hover:shadow-brand-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                <div className="overflow-hidden border-b border-border" aria-hidden>
                  {theme ? <CategoryPreview theme={theme} label={c.label} previewUrl={previews.get(theme.key) ?? null} /> : null}
                </div>
                <div className="p-4">
                  <p className="font-brand font-bold text-brand-ink group-hover:text-brand">{c.label}</p>
                  <p className="mt-1 text-xs text-muted sm:text-sm">{c.body}</p>
                  {count ? <p className="mt-2 text-xs font-semibold text-brand">{count === 1 ? "1 theme" : `${count} themes`}</p> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function CategoryPreview({ theme, label, previewUrl }: { theme: MarketplaceTheme; label: string; previewUrl: string | null }) {
  const fallback = (
    <div className="h-full" style={{ background: theme.preset.tokens.colors.background }}>
      <ThemeMockup preset={theme.preset} name={label} />
    </div>
  );
  if (previewUrl) return <LiveFrame src={previewUrl} viewport={DESKTOP_VIEWPORT} fallback={fallback} />;
  return (
    <div className="overflow-hidden" style={{ aspectRatio: `${DESKTOP_VIEWPORT.width} / ${DESKTOP_VIEWPORT.height}` }}>
      {fallback}
    </div>
  );
}

export function ThemeShowcase({ themes, previews }: { themes: MarketplaceTheme[]; previews: Map<string, string> }) {
  return (
    <Section id={SECTION_IDS.themes} labelledBy="themes-title">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading id="themes-title" align="left" eyebrow="Themes" title="Start with a design made for your products" body="Preview a theme on a demo store, then use it for your own. Your products and text replace the samples." />
        <ButtonLink href={THEMES_HREF} variant="secondary" track={{ id: "all_themes", location: "home_themes" }}>
          See all themes <ArrowRight aria-hidden className="size-4" />
        </ButtonLink>
      </div>
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <li key={t.key} className="h-full">
            <ThemeCard theme={t} previewUrl={previews.get(t.key) ?? null} location="home_themes" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function HowItWorksSteps({ steps = HOW_IT_WORKS, headingId = "how-title", compact = false }: { steps?: Step[]; headingId?: string; compact?: boolean }) {
  return (
    <ol className={`mt-12 grid gap-5 ${compact ? "md:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-5"}`} aria-labelledby={headingId}>
      {steps.map((s, i) => (
        <li key={s.title} className="relative rounded-brand-lg border border-border bg-white p-6">
          <span className="grid size-10 place-items-center rounded-full bg-brand font-brand text-base font-bold text-white" aria-hidden>
            {i + 1}
          </span>
          <h3 className="mt-4 font-brand text-base font-bold text-brand-ink">
            <span className="sr-only">Step {i + 1}: </span>
            {s.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <Section id={SECTION_IDS.howItWorks} tone="canvas" labelledBy="how-title">
      <SectionHeading id="how-title" eyebrow="How it works" title="From sign-up to your first sale" body="Five steps, and your store stays private until you choose to publish it." />
      <HowItWorksSteps compact />
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href={SIGNUP_HREF} track={{ id: "create_store", location: "how_it_works" }}>
          {CTA_CREATE}
        </ButtonLink>
        <ButtonLink href="/how-it-works" variant="secondary" track={{ id: "how_it_works_detail", location: "how_it_works" }}>
          Read the full guide
        </ButtonLink>
      </div>
    </Section>
  );
}

export function FaqSection({ faqs, title = "Questions sellers ask" }: { faqs: Faq[]; title?: string }) {
  return (
    <Section id={SECTION_IDS.faq} labelledBy="faq-title">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading id="faq-title" align="left" eyebrow="FAQ" title={title} body="Straight answers about setting up and running your store." />
        <div className="divide-y divide-border rounded-brand-lg border border-border bg-white">
          {faqs.map((f) => (
            <details key={f.question} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-4 font-semibold text-brand-ink focus-visible:outline-2 focus-visible:outline-brand">
                {f.question}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-canvas text-brand transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function FinalCta({ trialDays }: { trialDays: number }) {
  return (
    <section className="bg-white px-4 pb-20 sm:px-6" aria-labelledby="final-cta-title">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-brand-xl bg-brand-ink px-6 py-14 text-center text-white sm:px-12">
        <h2 id="final-cta-title" className="mx-auto max-w-2xl font-brand text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          Ready to open your online store?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
          {trialDays > 0 ? `Create your store and try it free for ${trialDays} days. ` : "Create your store today. "}It stays private until you publish.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={SIGNUP_HREF} variant="light" size="lg" track={{ id: "create_store", location: "final_cta" }}>
            {CTA_CREATE}
          </ButtonLink>
          <ButtonLink href={THEMES_HREF} variant="ghostLight" size="lg" track={{ id: "explore_themes", location: "final_cta" }}>
            {CTA_THEMES}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
