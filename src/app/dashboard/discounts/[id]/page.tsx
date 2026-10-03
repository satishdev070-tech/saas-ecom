import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getDiscount } from "@/features/marketing/queries";
import { DiscountForm } from "@/features/dashboard-ui/forms";
import { discountPickers, toFormValue } from "../form-data";

export const metadata: Metadata = { title: "Edit discount" };

export default async function EditDiscount({ params, searchParams }: PageProps<"/dashboard/discounts/[id]">) {
  const ctx = await requireTenantPermission("marketing.read");
  const { id } = await params;
  const sp = await searchParams;
  const [d, pickers] = await Promise.all([getDiscount(ctx.tenantId, id), discountPickers(ctx.tenantId)]);
  if (!d) notFound();
  return (
    <div>
      <PageHeader title={d.discount.code ?? d.discount.title} description={`Used ${d.discount.usage_count} times`} back={<Link href="/dashboard/discounts" className="text-muted hover:text-foreground">← Discounts</Link>} />
      {sp.created ? <p role="status" className="mb-4 text-sm text-success">Discount created.</p> : null}
      <DiscountForm value={toFormValue(d.discount, d.productIds, d.collectionIds)} {...pickers} />
    </div>
  );
}
