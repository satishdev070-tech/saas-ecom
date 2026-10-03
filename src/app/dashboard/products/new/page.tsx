import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { emptyProductDraft } from "@/features/catalog/types";
import { ProductEditor } from "@/features/catalog/components/product-editor";
import { productEditorOptions } from "../editor-data";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const ctx = await requireTenantPermission("catalog.write");
  const opts = await productEditorOptions(ctx.tenantId);
  return (
    <div>
      <PageHeader title="Add product" back={<Link href="/dashboard/products" className="text-muted hover:text-foreground">← Products</Link>} />
      <ProductEditor initial={emptyProductDraft()} {...opts} initialCollectionIds={[]} canWriteInventory={can(ctx, "inventory.write")} stock={{}} />
    </div>
  );
}
