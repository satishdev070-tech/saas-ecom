import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { listPlans, tenantsPerPlan } from "@/features/platform/server/queries";
import { PLAN_LIMIT_KEYS, planLimitValue } from "@/features/platform/schemas";
import { DeletePlanButton } from "@/features/platform/components/admin-forms";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { formatMoney, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage({ searchParams }: PageProps<"/admin/plans">) {
  await requirePlatform("platform.plans.manage");
  const sp = await searchParams;
  const plans = await listPlans();
  const counts = await tenantsPerPlan(plans.map((p) => p.id));
  return (
    <div>
      <PageHeader
        title="Plans"
        description="Pricing, limits and included features. Changes apply to every store on the plan."
        actions={
          <Link href="/admin/plans/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            New plan
          </Link>
        }
      />
      {sp.saved || sp.deleted ? (
        <p role="status" className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {sp.saved ? "Plan saved." : "Plan deleted."}
        </p>
      ) : null}
      {plans.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Plan</th>
              <th className={`${th} text-right`}>Monthly</th>
              <th className={`${th} text-right`}>Yearly</th>
              <th className={th}>Limits</th>
              <th className={`${th} text-right`}>Stores</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td className={td}>
                  <Link href={`/admin/plans/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>{" "}
                  {p.active ? null : <Badge>inactive</Badge>}
                  <p className="text-xs text-muted">
                    {p.code} · {p.trialDays}-day trial
                  </p>
                </td>
                <td className={`${td} text-right tabular-nums`}>{formatMoney(toMinor(p.priceMonthly))}</td>
                <td className={`${td} text-right tabular-nums`}>{formatMoney(toMinor(p.priceYearly))}</td>
                <td className={`${td} text-xs text-muted`}>{PLAN_LIMIT_KEYS.map((k) => `${k.replace("_", " ")}: ${planLimitValue(p.limits, k) ?? "∞"}`).join(" · ")}</td>
                <td className={`${td} text-right tabular-nums`}>{counts.get(p.id) ?? 0}</td>
                <td className={td}>{(counts.get(p.id) ?? 0) === 0 ? <DeletePlanButton id={p.id} name={p.name} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No plans yet" />
      )}
    </div>
  );
}
