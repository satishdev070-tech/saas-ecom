"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cn } from "@/lib/cn";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { ThemeMockup } from "@/features/theme/marketplace/mockup";
import type { ThemePreset } from "@/features/theme/marketplace/types";
import { chooseThemeAction, choosePlanAction, saveBusinessAction } from "../actions";

function slugify(v: string) {
  return v.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

const Carry = ({ plan, theme }: { plan?: string | null; theme?: string | null }) => (
  <>
    {plan ? <input type="hidden" name="plan" value={plan} /> : null}
    {theme ? <input type="hidden" name="theme" value={theme} /> : null}
  </>
);

/** Step 2. Without `store`: create the store. With `store` (seller went Back): edit the category. */
export function BusinessForm({
  rootDomain,
  categories,
  defaults,
  store,
  plan,
  theme,
}: {
  rootDomain: string;
  categories: { value: string; label: string }[];
  defaults: { name: string; category: string; slug?: string };
  store?: { id: string; name: string; slug: string };
  plan: string | null;
  theme: string | null;
}) {
  const [state, action] = useActionState(saveBusinessAction, null);
  const errors = fieldErrors(state);
  const [slug, setSlug] = useState(() => defaults.slug ?? slugify(defaults.name));
  const [touched, setTouched] = useState(Boolean(defaults.slug));
  const options = [{ value: "", label: "Choose a category" }, ...categories];
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Carry plan={plan} theme={theme} />
      {store ? (
        <>
          <input type="hidden" name="store" value={store.id} />
          <div className="rounded-brand-md bg-brand-canvas p-4 text-sm">
            <p className="font-semibold text-brand-ink">{store.name}</p>
            <p className="mt-1 text-muted">
              {store.slug}.{rootDomain}
            </p>
            <p className="mt-2 text-xs text-muted">You can change the business name later in Settings. The store address can&apos;t be changed after it&apos;s created.</p>
          </div>
        </>
      ) : (
        <>
          <TextField
            label="Business name"
            name="name"
            required
            autoComplete="organization"
            defaultValue={defaults.name}
            errors={errors.name}
            onChange={(e) => !touched && setSlug(slugify(e.target.value))}
          />
        </>
      )}
      <SelectField label="Business category" name="category" required options={options} defaultValue={defaults.category} errors={errors.category} hint="We'll suggest themes made for this kind of business." />
      {store ? null : (
        <TextField
          label="Store address"
          name="slug"
          required
          value={slug}
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setTouched(true);
            setSlug(slugify(e.target.value));
          }}
          errors={errors.slug}
          hint={`Your store's web address: ${slug || "your-store"}.${rootDomain}. You can connect your own domain later.`}
        />
      )}
      <SubmitButton size="lg" className="w-full">
        {store ? "Save and continue" : "Create store and continue"}
      </SubmitButton>
      {store ? null : <p className="text-center text-xs text-muted">Your store is created as a private draft. Nobody can see it until you publish.</p>}
    </form>
  );
}

export type ThemeOption = { key: string; name: string; tagline: string; preset: ThemePreset };

/** Step 3: pick a theme (applied as a draft) or skip. */
export function ThemeForm({ store, themes, selected, plan, backHref }: { store: string; themes: ThemeOption[]; selected: string | null; plan: string | null; backHref: string }) {
  const [state, action] = useActionState(chooseThemeAction, null);
  const errors = fieldErrors(state);
  const [choice, setChoice] = useState(selected ?? themes[0]?.key ?? "");
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="store" value={store} />
      <Carry plan={plan} />
      <fieldset>
        <legend className="sr-only">Themes</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <label key={t.key} className={cn("cursor-pointer overflow-hidden rounded-brand-md border bg-white transition-shadow has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand", choice === t.key ? "border-brand ring-2 ring-brand" : "border-border hover:shadow-brand-card")}>
              <input type="radio" name="choice" value={t.key} checked={choice === t.key} onChange={() => setChoice(t.key)} className="sr-only" />
              <div className="h-40 overflow-hidden border-b border-border" aria-hidden>
                <ThemeMockup preset={t.preset} name={t.name.split(" ")[0]!} />
              </div>
              <span className="block p-3">
                <span className="block font-semibold text-brand-ink">{t.name}</span>
                <span className="block text-xs text-muted">{t.tagline}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.choice ? (
          <p role="alert" className="mt-2 text-small text-error">
            {errors.choice[0]}
          </p>
        ) : null}
      </fieldset>
      <p className="text-sm text-muted">
        The theme is saved as a draft with sample sections; your own products and text replace them. Browse all themes later in Dashboard → Themes.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <Link href={backHref} className="text-sm font-semibold text-muted hover:text-brand-ink">
          ← Back
        </Link>
        <div className="flex flex-wrap gap-3">
          <SubmitButton variant="secondary" name="skip" value="1">
            Skip for now
          </SubmitButton>
          <SubmitButton>Use this theme</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export type PlanOption = { code: string; name: string; description: string; price: string; highlights: string[] };

/** Step 4: record a preferred plan (no purchase, no entitlement change) or skip. */
export function PlanForm({ store, plans, selected, backHref }: { store: string; plans: PlanOption[]; selected: string | null; backHref: string }) {
  const [state, action] = useActionState(choosePlanAction, null);
  const [choice, setChoice] = useState(selected ?? "");
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="store" value={store} />
      <fieldset>
        <legend className="sr-only">Plans</legend>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <label key={p.code} className={cn("flex cursor-pointer flex-col rounded-brand-md border bg-white p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand", choice === p.code ? "border-brand ring-2 ring-brand" : "border-border")}>
              <input type="radio" name="choice" value={p.code} checked={choice === p.code} onChange={() => setChoice(p.code)} className="sr-only" />
              <span className="font-brand text-lg font-bold text-brand-ink">{p.name}</span>
              <span className="text-xs text-muted">{p.description}</span>
              <span className="mt-3 font-brand text-2xl font-extrabold text-brand-ink">{p.price}</span>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {p.highlights.slice(0, 4).map((h) => (
                  <li key={h}>· {h}</li>
                ))}
              </ul>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <Link href={backHref} className="text-sm font-semibold text-muted hover:text-brand-ink">
          ← Back
        </Link>
        <div className="flex flex-wrap gap-3">
          <SubmitButton variant="secondary" name="skip" value="1">
            Decide later
          </SubmitButton>
          <SubmitButton disabled={!choice}>Save my plan choice</SubmitButton>
        </div>
      </div>
    </form>
  );
}
