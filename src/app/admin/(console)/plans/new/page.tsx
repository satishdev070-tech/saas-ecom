import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { listFeatureFlags } from "@/features/platform/server/queries";
import { PlanForm } from "@/features/platform/components/admin-forms";
import { Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage() {
  await requirePlatform("platform.plans.manage");
  const flags = await listFeatureFlags();
  return (
    <div>
      <PageHeader title="New plan" back={<Link href="/admin/plans">← Plans</Link>} />
      <Card>
        <PlanForm catalogue={flags.map((f) => f.key)} value={{ code: "", name: "", description: "", priceMonthly: "0", priceYearly: "0", trialDays: "14", sortOrder: "0", active: true, limits: {}, features: {} }} />
      </Card>
    </div>
  );
}
