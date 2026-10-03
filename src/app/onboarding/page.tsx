import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CreditCard, Eye, Package, Rocket, Truck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INDUSTRIES, industryName } from "@/features/stores/industries";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";
import { findTheme } from "@/features/marketing-site/themes";
import { getMarketingPlans } from "@/features/marketing-site/server/plans";
import { findPlan, planHighlights, planPriceView } from "@/features/marketing-site/plans";
import { buttonClass } from "@/features/marketing-site/components/ui";
import { OnboardingShell, StepHeading } from "@/features/onboarding/components/shell";
import { BusinessForm, PlanForm, ThemeForm, type ThemeOption } from "@/features/onboarding/components/forms";
import { listOwnedStores, requestedChoices, type OnboardingStore } from "@/features/onboarding/server";
import { onboardingHref, previousStep, resolveStep, UUID_RE } from "@/features/onboarding/steps";
import { PreviewStoreButton } from "@/features/stores/components/launch-controls";

export const metadata: Metadata = { title: "Set up your store", robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const user = await requireUser("/onboarding");
  const choice = await requestedChoices(sp);
  const owned = await listOwnedStores(user.id);
  const storeParam = typeof sp.store === "string" && UUID_RE.test(sp.store) ? owned.find((s) => s.tenantId === sp.store) : undefined;
  const wantsNew = sp.new === "1";
  const draft = owned.find((s) => s.launchStatus === "draft");

  // Resume: an unfinished (draft) store continues where setup left off.
  if (!storeParam && !wantsNew && draft) redirect(onboardingHref("theme", draft.tenantId, choice));
  // Existing seller with only live stores: offer the dashboard or a new store, never a silent duplicate.
  if (!storeParam && !wantsNew && owned.length > 0) return <ExistingSeller stores={owned} choice={choice} />;

  const store = storeParam;
  const step = resolveStep(sp.step, Boolean(store));
  const back = (s: typeof step) => {
    const prev = previousStep(s);
    return prev ? onboardingHref(prev, store?.tenantId, choice) : "/dashboard";
  };

  if (step === "business") {
    const { data } = await (await createSupabaseServerClient()).auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as { store_name?: unknown };
    const fromQuery = typeof sp.name === "string" ? sp.name : "";
    const defaultName = (fromQuery || (typeof meta.store_name === "string" ? meta.store_name : "")).slice(0, 120);
    const suggested = store?.category ?? (choice.theme ? findTheme(choice.theme)?.industry : undefined) ?? "";
    return (
      <OnboardingShell step="business">
        <StepHeading eyebrow="Step 2 of 5" title="Tell us about your business" description="This sets up your store and its web address." />
        <BusinessForm
          rootDomain={publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN}
          categories={INDUSTRIES.map((i) => ({ value: i.slug, label: i.name }))}
          defaults={{ name: defaultName, category: suggested }}
          store={store ? { id: store.tenantId, name: store.name, slug: store.slug } : undefined}
          plan={choice.plan}
          theme={choice.theme}
        />
      </OnboardingShell>
    );
  }

  if (step === "theme") {
    const themes = themeOptions(store!, choice.theme);
    const selected = choice.theme ?? store!.draftThemeKey ?? themes[0]?.key ?? null;
    return (
      <OnboardingShell step="theme" wide>
        <StepHeading
          eyebrow="Step 3 of 5"
          title="Choose a theme"
          description={store!.category ? `Themes made for ${industryName(store!.category)} stores. Nothing goes live until you publish.` : "Pick a starting design. Nothing goes live until you publish."}
        />
        <ThemeForm store={store!.tenantId} themes={themes} selected={selected} plan={choice.plan} backHref={back("theme")} />
      </OnboardingShell>
    );
  }

  if (step === "plan") {
    const plans = await getMarketingPlans();
    const selected = findPlan(plans, choice.plan)?.code ?? null;
    return (
      <OnboardingShell step="plan" wide>
        <StepHeading
          eyebrow="Step 4 of 5"
          title="Which plan suits you?"
          description={
            <>
              {store!.planName ? `Your store starts on the ${store!.planName} plan` : "Your store starts on our entry plan"}
              {store!.trialEndsAt ? ` with a free trial until ${dateFmt.format(new Date(store!.trialEndsAt))}` : ""}. Plans can&apos;t be bought online yet, so nothing is charged: we&apos;ll save your choice and our team applies plan changes.
            </>
          }
        />
        <PlanForm
          store={store!.tenantId}
          plans={plans.map((p) => ({ code: p.code, name: p.name, description: p.description, price: `${planPriceView(p, "monthly").amount}/month`, highlights: planHighlights(p) }))}
          selected={selected}
          backHref={back("plan")}
        />
      </OnboardingShell>
    );
  }

  return <Ready store={store!} />;
}

/** Themes for the store's category (requested theme first), else a varied starter set. */
function themeOptions(store: OnboardingStore, requested: string | null): ThemeOption[] {
  const pick = store.category ? MARKETPLACE_THEMES.filter((t) => t.industry === store.category) : [];
  const base = pick.length ? pick : ["fashion", "jewellery", "beauty", "furniture", "gourmet", "general"].flatMap((i) => MARKETPLACE_THEMES.find((t) => t.industry === i) ?? []);
  const req = requested ? findTheme(requested) : undefined;
  const list = req ? [req, ...base.filter((t) => t.key !== req.key)] : base;
  return list.slice(0, 9).map((t) => ({ key: t.key, name: t.name, tagline: t.tagline, preset: t.preset }));
}

function newStoreHref(choice: { plan: string | null; theme: string | null }): string {
  const qs = new URLSearchParams({ new: "1" });
  if (choice.plan) qs.set("plan", choice.plan);
  if (choice.theme) qs.set("theme", choice.theme);
  return `/onboarding?${qs}`;
}

function ExistingSeller({ stores, choice }: { stores: OnboardingStore[]; choice: { plan: string | null; theme: string | null } }) {
  return (
    <OnboardingShell step="business">
      <StepHeading eyebrow="Welcome back" title={stores.length === 1 ? "You already have a store" : `You already have ${stores.length} stores`} description="Go to your dashboard, or set up an additional store." />
      <ul className="mb-8 divide-y divide-border rounded-brand-md border border-border">
        {stores.map((s) => (
          <li key={s.tenantId} className="flex items-center justify-between gap-3 p-4">
            <span>
              <span className="block font-semibold text-brand-ink">{s.name}</span>
              <span className="block text-sm text-muted">{s.slug}</span>
            </span>
            <span className="rounded-full bg-brand-canvas px-2.5 py-1 text-xs font-semibold text-brand-ink">{s.launchStatus === "draft" ? "Draft" : "Live"}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={buttonClass("primary")}>
          Go to dashboard
        </Link>
        <Link href={newStoreHref(choice)} className={buttonClass("secondary")}>
          Set up another store
        </Link>
      </div>
    </OnboardingShell>
  );
}

function Ready({ store }: { store: OnboardingStore }) {
  const tasks = [
    { icon: Package, title: "Add your products", body: "Photos, prices, variants and stock.", href: "/dashboard/products/new", cta: "Add a product" },
    { icon: CreditCard, title: "Set up payments", body: "Turn on cash on delivery or connect Razorpay, Cashfree or PayU.", href: "/dashboard/settings/payments", cta: "Payment settings" },
    { icon: Truck, title: "Set up shipping", body: "Shipping rates, PIN code rules or a courier account.", href: "/dashboard/settings/shipping", cta: "Shipping settings" },
  ];
  return (
    <OnboardingShell step="ready" wide>
      <div className="mb-8 flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-mint text-[#15803d]" aria-hidden>
          <CheckCircle2 className="size-6" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Step 5 of 5</p>
          <h1 className="mt-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl">{store.name} is set up</h1>
          <p className="mt-2 text-muted">
            {store.launchStatus === "draft" ? "Your store is a private draft. Visitors see a ‘coming soon’ page until you publish it from your dashboard." : "Finish these steps to start taking orders."}
          </p>
        </div>
      </div>
      <h2 className="font-brand text-lg font-bold text-brand-ink">Before you publish</h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-3">
        {tasks.map((t) => (
          <li key={t.title} className="flex flex-col rounded-brand-md border border-border p-5">
            <t.icon aria-hidden className="size-5 text-brand" />
            <p className="mt-3 font-semibold text-brand-ink">{t.title}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{t.body}</p>
            <Link href={t.href} className="mt-4 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              {t.cta} →
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-brand-md bg-brand-canvas p-5">
        <Eye aria-hidden className="size-5 text-brand" />
        <p className="flex-1 text-sm text-brand-ink">Preview your store at any time. When it&apos;s ready, publish it from the dashboard home.</p>
        <PreviewStoreButton />
      </div>
      <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-6">
        <Link href="/dashboard?welcome=1" className={buttonClass("primary", "lg")}>
          <Rocket aria-hidden className="size-4" /> Go to my dashboard
        </Link>
      </div>
    </OnboardingShell>
  );
}
