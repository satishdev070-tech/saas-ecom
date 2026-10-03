import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePlatform } from "@/lib/platform/access";
import { getPlan, listFeatureFlags } from "@/features/platform/server/queries";
import { PLAN_LIMIT_KEYS, planFeatureValue, planLimitValue } from "@/features/platform/schemas";
import { PlanForm } from "@/features/platform/components/admin-forms";
import { Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Edit plan" };

export default async function EditPlanPage({ params }: PageProps<"/admin/plans/[id]">) {
  await requirePlatform("platform.plans.manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [p, flags] = await Promise.all([getPlan(id), listFeatureFlags()]);
  if (!p) notFound();
  const catalogue = flags.map((f) => f.key);
  return (
    <div>
      <PageHeader title={p.name} description="Edits apply to every store on this plan." back={<Link href="/admin/plans">← Plans</Link>} />
      <Card>
        <PlanForm
          catalogue={catalogue}
          value={{
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description ?? "",
            priceMonthly: String(p.priceMonthly),
            priceYearly: String(p.priceYearly),
            trialDays: String(p.trialDays),
            sortOrder: String(p.sortOrder),
            active: p.active,
            limits: Object.fromEntries(PLAN_LIMIT_KEYS.map((k) => [k, planLimitValue(p.limits, k)])),
            features: Object.fromEntries(catalogue.map((k) => [k, planFeatureValue(p.features, k)])),
          }}
        />
      </Card>
    </div>
  );
}
