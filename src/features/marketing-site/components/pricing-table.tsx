"use client";

import Link from "next/link";
import { useState } from "react";
import { maxYearlySavingsPercent, planHighlights, planPriceView, recommendedPlanCode, type BillingPeriod, type MarketingPlan } from "../plans";
import { SIGNUP_HREF } from "../content";
import { analyticsAttributes } from "../analytics";

export function PricingTable({ plans }: { plans: MarketingPlan[] }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const save = maxYearlySavingsPercent(plans);
  const rec = recommendedPlanCode(plans);
  return (
    <div>
      <div className="mb-10 flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-surface p-1 text-sm">
          {(["monthly", "yearly"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={`rounded-full px-4 py-1.5 capitalize ${period === p ? "bg-foreground text-background" : ""}`} {...analyticsAttributes("billing_toggle", p, "pricing")}>
              {p}
              {p === "yearly" && save > 0 ? <span className="ml-1 text-xs opacity-80">save {save}%</span> : null}
            </button>
          ))}
        </div>
      </div>
      <ul className={`grid gap-6 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
        {plans.map((plan) => {
          const v = planPriceView(plan, period);
          const featured = plan.code === rec;
          return (
            <li key={plan.code} className={`relative flex flex-col rounded-2xl border p-7 ${featured ? "border-foreground bg-foreground text-background shadow-xl" : "border-border bg-surface"}`}>
              {featured ? <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Most popular</span> : null}
              <h3 className="font-display text-2xl">{plan.name}</h3>
              {plan.description ? <p className={`mt-1 text-sm ${featured ? "opacity-80" : "text-muted"}`}>{plan.description}</p> : null}
              <p className="mt-6">
                <span className="text-4xl font-semibold tabular-nums">{v.amount}</span>
                <span className={featured ? "opacity-80" : "text-muted"}>{v.unit}</span>
              </p>
              <p className={`text-xs ${featured ? "opacity-70" : "text-muted"}`}>
                {v.note} · excl. GST{plan.trialDays ? ` · ${plan.trialDays}-day free trial` : ""}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {planHighlights(plan).map((h) => (
                  <li key={h} className="flex gap-2">
                    <span aria-hidden="true">✓</span>
                    {h}
                  </li>
                ))}
              </ul>
              <Link
                href={`${SIGNUP_HREF}?plan=${encodeURIComponent(plan.code)}`}
                className={`mt-8 inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold ${featured ? "bg-background text-foreground" : "bg-foreground text-background"}`}
                {...analyticsAttributes("cta_click", `plan-${plan.code}`, "pricing")}
              >
                Start free trial
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
