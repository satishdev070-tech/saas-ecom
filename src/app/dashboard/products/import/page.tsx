import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { Card, PageHeader } from "@/components/ui/layout";
import { PRODUCT_CSV_COLUMNS } from "@/features/catalog/csv";
import { ImportProducts } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportPage() {
  await requireTenantPermission("catalog.write");
  return (
    <div className="space-y-6">
      <PageHeader title="Import products" description="Create or update products from a CSV. Preview first to see what will change." back={<Link href="/dashboard/products" className="text-muted hover:text-foreground">← Products</Link>} />
      <Card title="Upload CSV">
        <ImportProducts />
      </Card>
      <Card title="CSV format" description="One row per variant; rows with the same handle form one product. Export your products to get a template.">
        <p className="break-words font-mono text-xs text-muted">{PRODUCT_CSV_COLUMNS.join(", ")}</p>
      </Card>
    </div>
  );
}
