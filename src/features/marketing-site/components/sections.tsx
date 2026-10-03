import Link from "next/link";
import {
  ANNOUNCEMENT,
  BUILDER_POINTS,
  BUILDER_SECTIONS,
  BUILT_FOR,
  DEMO_BRANDS,
  FASHION_FEATURES,
  FEATURE_ROWS,
  HERO,
  HOW_IT_WORKS,
  PROBLEM_SOLUTIONS,
  SAMPLE_METRICS,
  SECTION_IDS,
  SIGNUP_HREF,
  type Faq,
  type FeatureRowCopy,
} from "../content";
import { THEME_LOOKS } from "../looks";
import { formatMetric } from "../motion";
import { analyticsAttributes } from "../analytics";
import { ctaPrimary, ctaSecondary } from "./chrome";
import { StorefrontPreview } from "./storefront-preview";

const wrap = "mx-auto max-w-6xl px-4 sm:px-6";

function SectionHead({ eyebrow, title, body, center = true }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={`mb-12 max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl leading-tight sm:text-5xl">{title}</h2>
      {body ? <p className="mt-4 text-lg text-muted">{body}</p> : null}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-10 sm:pt-16" aria-labelledby="hero-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,var(--color-accent)_0%,transparent_60%)] opacity-15" />
      <div className={`${wrap} relative`}>
        <Link href={`/#${SECTION_IDS.themes}`} className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm">
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{ANNOUNCEMENT.label}</span>
          <span className="text-muted">{ANNOUNCEMENT.message}</span>
          <span aria-hidden="true">→</span>
        </Link>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{HERO.eyebrow}</p>
          <h1 id="hero-title" className="mt-4 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
            {HERO.headline.map((line, i) => (
              <span key={line} className={`block ${i === 2 ? "italic text-accent" : ""}`}>
                {line}
              </span>
            ))}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">{HERO.subheadline}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={SIGNUP_HREF} className={ctaPrimary} {...analyticsAttributes("cta_click", "hero-primary", "hero")}>
              {HERO.primaryCta}
            </Link>
            <Link href={`/#${SECTION_IDS.themes}`} className={ctaSecondary} {...analyticsAttributes("cta_click", "hero-secondary", "hero")}>
              {HERO.secondaryCta}
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
            {HERO.assurances.map((a) => (
              <li key={a} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-accent">
                  ✓
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
        <div id={SECTION_IDS.preview} className="mt-14">
          <StorefrontPreview showPicker={false} />
        </div>
      </div>
    </section>
  );
}

export function BrandStrip() {
  const font = { serif: "font-display", sans: "font-sans font-semibold", caps: "font-sans font-bold uppercase tracking-[0.25em] text-sm", italic: "font-display italic" } as const;
  return (
    <section id={SECTION_IDS.proof} aria-label="Demo storefronts" className="border-y border-border bg-surface py-10">
      <div className={wrap}>
        <p className="text-center text-xs uppercase tracking-[0.2em] text-muted">Made for labels like these (demo storefronts)</p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-xl text-muted">
          {DEMO_BRANDS.map((b) => (
            <li key={b.name} className={font[b.style]}>
              {b.name}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-muted">Built for {BUILT_FOR.join(" · ")}</p>
      </div>
    </section>
  );
}

export function ProblemSolution() {
  return (
    <section className="py-24" aria-labelledby="ps-title">
      <div className={wrap}>
        <div className="mb-12 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Why sellers switch</p>
          <h2 id="ps-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            From DMs and spreadsheets to a real store.
          </h2>
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {PROBLEM_SOLUTIONS.map((p) => (
            <li key={p.problem} className="grid gap-2 py-6 md:grid-cols-2 md:gap-10">
              <p className="text-muted line-through decoration-accent/40">{p.problem}</p>
              <p className="font-medium">{p.solution}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Themes() {
  return (
    <section id={SECTION_IDS.themes} className="bg-surface py-24" aria-labelledby="themes-title">
      <div className={wrap}>
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Themes</p>
          <h2 id="themes-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            A storefront that looks like your label.
          </h2>
          <p className="mt-4 text-lg text-muted">Switch between looks below. Every colour, font and button shape is a setting you control.</p>
        </div>
        <StorefrontPreview />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_LOOKS.map((l) => (
            <li key={l.key} className="rounded-xl border border-border bg-background p-5">
              <span className="flex gap-1" aria-hidden="true">
                {[l.colors.background, l.colors.surface, l.colors.accent, l.colors.text].map((c) => (
                  <span key={c} className="h-6 flex-1 rounded border border-black/5" style={{ background: c }} />
                ))}
              </span>
              <p className="mt-4 font-semibold">
                {l.name} <span className="text-xs font-normal text-muted">{l.kind === "theme" ? "Theme" : "Look"}</span>
              </p>
              <p className="text-sm text-muted">{l.tagline}</p>
              <p className="mt-2 text-xs text-muted">Best for: {l.bestFor}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Builder() {
  return (
    <section id={SECTION_IDS.builder} className="py-24" aria-labelledby="builder-title">
      <div className={`${wrap} grid items-center gap-12 lg:grid-cols-2`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Theme editor</p>
          <h2 id="builder-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            Arrange your homepage like a lookbook.
          </h2>
          <dl className="mt-8 space-y-6">
            {BUILDER_POINTS.map((p) => (
              <div key={p.title}>
                <dt className="font-semibold">{p.title}</dt>
                <dd className="mt-1 text-muted">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ol className="rounded-2xl border border-border bg-surface p-4 shadow-xl shadow-black/5" aria-label="Example homepage sections">
          {BUILDER_SECTIONS.map((s, i) => (
            <li key={s} className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm last:mb-0">
              <span aria-hidden="true" className="cursor-grab text-muted">
                ⋮⋮
              </span>
              <span className="flex-1">{s}</span>
              <span className="text-xs text-muted">{i === 0 || i === BUILDER_SECTIONS.length - 1 ? "layout" : "section"}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeatureRow({ row, flip }: { row: FeatureRowCopy; flip: boolean }) {
  return (
    <li id={row.id} className="grid gap-8 py-14 md:grid-cols-2 md:items-center md:gap-16">
      <div className={flip ? "md:order-2" : ""}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{row.eyebrow}</p>
        <h3 className="mt-3 font-display text-3xl leading-tight">{row.title}</h3>
        <p className="mt-3 text-muted">{row.body}</p>
      </div>
      <ul className="space-y-3 rounded-2xl border border-border bg-surface p-6">
        {row.points.map((p) => (
          <li key={p} className="flex gap-3 text-sm">
            <span aria-hidden="true" className="mt-0.5 text-accent">
              ●
            </span>
            {p}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function FeatureRows() {
  return (
    <section id={SECTION_IDS.features} className="py-24" aria-labelledby="features-title">
      <div className={wrap}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Everything in one place</p>
          <h2 id="features-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            Run the whole business from one dashboard.
          </h2>
        </div>
        <ul className="divide-y divide-border">
          {FEATURE_ROWS.map((r, i) => (
            <FeatureRow key={r.id} row={r} flip={i % 2 === 1} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FashionFeatures() {
  return (
    <section id={SECTION_IDS.fashion} className="bg-foreground py-24 text-background" aria-labelledby="fashion-title">
      <div className={wrap}>
        <div className="mb-12 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">Fashion-first</p>
          <h2 id="fashion-title" className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            The details Indian fashion actually needs.
          </h2>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-2xl bg-background/15 sm:grid-cols-2 lg:grid-cols-4">
          {FASHION_FEATURES.map((f) => (
            <li key={f.key} className="bg-foreground p-6">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-2 text-sm opacity-75">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Metrics() {
  return (
    <section className="py-20" aria-labelledby="metrics-title">
      <div className={wrap}>
        <h2 id="metrics-title" className="sr-only">
          Illustrative results
        </h2>
        <ul className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
          {SAMPLE_METRICS.map((m) => (
            <li key={m.label}>
              <p className="font-display text-5xl tabular-nums">{formatMetric(m.value, m)}</p>
              <p className="mt-2 text-sm text-muted">{m.label}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-xs text-muted">Illustrative figures for a sample store, not a guarantee of results.</p>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id={SECTION_IDS.howItWorks} className="bg-surface py-24" aria-labelledby="how-title">
      <div className={wrap}>
        <SectionHead eyebrow="How it works" title="Live in an afternoon." />
        <ol className="grid gap-6 md:grid-cols-4">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-background p-6">
              <span className="font-display text-4xl text-accent">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-4 font-semibold">{s.title}</p>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section id={SECTION_IDS.faq} className="py-24" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="faq-title" className="mb-10 text-center font-display text-3xl sm:text-5xl">
          Questions, answered.
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.question} className="group py-5" {...analyticsAttributes("faq_open", f.question.slice(0, 40), "faq")}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.question}
                <span aria-hidden="true" className="text-xl text-muted transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ trialDays }: { trialDays: number }) {
  return (
    <section className="px-4 pb-24 sm:px-6" aria-labelledby="cta-title">
      <div className="mx-auto max-w-6xl rounded-3xl bg-foreground px-6 py-16 text-center text-background sm:px-16">
        <h2 id="cta-title" className="font-display text-4xl leading-tight sm:text-6xl">
          Your label deserves its own address.
        </h2>
        <p className="mx-auto mt-4 max-w-xl opacity-80">{trialDays ? `Start with a ${trialDays}-day free trial. ` : ""}No card needed to explore.</p>
        <Link href={SIGNUP_HREF} className="mt-8 inline-flex h-12 items-center rounded-full bg-background px-8 font-semibold text-foreground" {...analyticsAttributes("cta_click", "final", "footer-cta")}>
          {HERO.primaryCta}
        </Link>
      </div>
    </section>
  );
}
