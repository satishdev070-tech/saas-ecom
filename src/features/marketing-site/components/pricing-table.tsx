"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { hasYearlyBilling, maxYearlySavingsPercent, planHighlights, planPriceView, recommendedPlanCode, yearlySavingsPercent, type BillingPeriod, type MarketingPlan } from "../plans";
import { signupHref } from "../content";
import { analyticsAttributes } from "../analytics";
import { buttonClass } from "./ui";

/**
 * Plan cards. Prices, limits and trials come from public.plans (server/plans.ts). Choosing a plan
 * only carries the plan code into sign-up; it never grants access (entitlements are server-side).
 */
export function PricingTable({ plans, headingLevel = "h3" }: { plans: MarketingPlan[]; headingLevel?: "h2" | "h3" }) {
  const yearly = hasYearlyBilling(plans);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const save = maxYearlySavingsPercent(plans);
  const rec = recommendedPlanCode(plans);
  const H = headingLevel;
  return (
    <div>
      {yearly ? (
        <div className="mb-10 flex justify-center">
          <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-white p-1 text-sm font-semibold shadow-brand-card">
            {(["monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={cn("rounded-full px-5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-brand", period === p ? "bg-brand text-white" : "text-brand-ink hover:bg-brand-canvas")}
                {...analyticsAttributes("billing_toggle", p, "pricing")}
              >
                {p === "monthly" ? "Monthly" : "Yearly"}
                {p === "yearly" && save > 0 ? <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", period === p ? "bg-white/20" : "bg-brand-accent-soft")}>save up to {save}%</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ul className={cn("grid gap-6", plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
        {plans.map((plan) => {
          const v = planPriceView(plan, yearly ? period : "monthly");
          const featured = plan.code === rec;
          const saving = yearlySavingsPercent(plan.monthlyMinor, plan.yearlyMinor);
          return (
            <li key={plan.code} className={cn("relative flex flex-col rounded-brand-lg border bg-white p-7", featured ? "border-brand shadow-brand-float ring-1 ring-brand" : "border-border")}>
              {featured ? <span className="absolute -top-3 left-7 rounded-full bg-brand-accent px-3 py-1 text-xs font-bold text-brand-ink">Recommended</span> : null}
              <H className="font-brand text-xl font-bold text-brand-ink">{plan.name}</H>
              {plan.description ? <p className="mt-1 text-sm text-muted">{plan.description}</p> : null}
              <p className="mt-6 flex items-baseline gap-1 text-brand-ink">
                <span className="font-brand text-4xl font-extrabold tabular-nums">{v.amount}</span>
                <span className="text-muted">{v.unit}</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {v.note}
                {period === "yearly" && saving > 0 ? ` · saves ${saving}%` : ""}
              </p>
              {plan.trialDays ? <p className="mt-3 inline-flex w-fit rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold text-[#15803d]">{plan.trialDays}-day free trial</p> : null}
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-brand-ink">
                {planHighlights(plan).map((h) => (
                  <li key={h} className="flex gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.5} />
                    {h}
                  </li>
                ))}
              </ul>
              <Link
                href={signupHref({ plan: plan.code })}
                className={cn("mt-8", buttonClass(featured ? "primary" : "secondary", "md", "w-full"))}
                {...analyticsAttributes("cta_click", `plan_${plan.code}`, "pricing")}
              >
                Choose {plan.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
