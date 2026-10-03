import { Check, Minus } from "lucide-react";
import { planComparison, type MarketingPlan } from "../plans";

/** Server-rendered feature comparison, derived from plan limits/features only. */
export function PlanComparison({ plans }: { plans: MarketingPlan[] }) {
  const rows = planComparison(plans);
  return (
    <div className="relative overflow-x-auto rounded-brand-lg border border-border bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Plan comparison</caption>
        <thead className="bg-brand-canvas">
          <tr>
            <th scope="col" className="px-5 py-4 font-semibold text-muted">
              Feature
            </th>
            {plans.map((p) => (
              <th key={p.code} scope="col" className="px-5 py-4 font-brand text-base font-bold text-brand-ink">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="px-5 py-3.5 font-medium text-brand-ink">
                {r.label}
              </th>
              {r.cells.map((c, i) => (
                <td key={plans[i]!.code} className="px-5 py-3.5 text-brand-ink tabular-nums">
                  {c === true ? (
                    <>
                      <Check aria-hidden className="size-4 text-brand" strokeWidth={2.5} />
                      <span className="sr-only">Included</span>
                    </>
                  ) : c === false ? (
                    <>
                      <Minus aria-hidden className="size-4 text-subtle" />
                      <span className="sr-only">Not included</span>
                    </>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
