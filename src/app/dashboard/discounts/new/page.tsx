import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { DiscountForm } from "@/features/dashboard-ui/forms";
import { discountPickers, toFormValue } from "../form-data";

export const metadata: Metadata = { title: "Create discount" };

export default async function NewDiscount() {
  const ctx = await requireTenantPermission("marketing.write");
  const pickers = await discountPickers(ctx.tenantId);
  return (
    <div>
      <PageHeader title="Create discount" back={<Link href="/dashboard/discounts" className="text-muted hover:text-foreground">← Discounts</Link>} />
      <DiscountForm value={toFormValue(null)} {...pickers} />
    </div>
  );
}
