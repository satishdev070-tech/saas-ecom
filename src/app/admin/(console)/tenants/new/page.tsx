import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { listPlans } from "@/features/platform/server/queries";
import { CreateTenantForm } from "@/features/platform/components/admin-forms";
import { Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "New store" };

export default async function NewTenantPage() {
  await requirePlatform("platform.tenants.manage");
  const plans = (await listPlans()).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  return (
    <div>
      <PageHeader title="New store" description="Create a store on behalf of an existing user. They become its owner." back={<Link href="/admin/stores">← Stores</Link>} />
      <Card>
        <CreateTenantForm plans={plans} />
      </Card>
    </div>
  );
}
