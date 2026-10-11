import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { publicEnv } from "@/lib/env/public";
import { listPlans } from "@/features/platform/server/queries";
import { AdminCreateStoreForm } from "@/features/platform/components/store-admin-forms";
import { INDUSTRIES } from "@/features/stores/industries";
import { MARKETPLACE_THEMES } from "@/features/theme/marketplace/catalog";
import { THEME_STYLE_LABELS } from "@/features/theme/marketplace/types";
import { Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "New store" };

export default async function NewTenantPage() {
  const ctx = await requirePlatform("platform.tenants.manage");
  const plans = (await listPlans()).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }));
  const industries = INDUSTRIES.map((i) => ({ value: i.slug, label: i.name }));
  const themes = MARKETPLACE_THEMES.map((t) => ({ key: t.key, name: t.name, industry: t.industry, style: THEME_STYLE_LABELS[t.style] }));
  return (
    <div>
      <PageHeader
        title="New store"
        description="Create a store with full control: owner account (existing or new), plan and trial, industry, theme and launch state. Everything is audited."
        back={<Link href="/admin/stores">← Stores</Link>}
      />
      <Card>
        <AdminCreateStoreForm plans={plans} industries={industries} themes={themes} superAdmin={ctx.role === "super_admin"} rootDomain={publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN} />
      </Card>
    </div>
  );
}
