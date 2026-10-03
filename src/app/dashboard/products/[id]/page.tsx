import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getProductForAdmin } from "@/features/catalog/server/products";
import { variantTitle } from "@/features/catalog/variants";
import { ProductEditor } from "@/features/catalog/components/product-editor";
import { DeleteProductButton, ProductMediaManager } from "@/features/catalog/components/catalog-forms";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { productEditorOptions } from "../editor-data";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/dashboard/products/[id]">) {
  const ctx = await requireTenantPermission("catalog.read");
  const { id } = await params;
  const sp = await searchParams;
  const [product, opts] = await Promise.all([getProductForAdmin(ctx.tenantId, id), productEditorOptions(ctx.tenantId)]);
  if (!product) notFound();
  const d = product.draft;
  const writable = can(ctx, "catalog.write");
  return (
    <div className="space-y-6">
      <PageHeader
        title={d.title || "Untitled product"}
        back={<Link href="/dashboard/products" className="text-muted hover:text-foreground">← Products</Link>}
        actions={
          <>
            {d.status === "active" ? (
              <a href={`${storeOrigin(storeSubdomain(ctx.tenantSlug))}/products/${d.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm">
                View on store ↗
              </a>
            ) : null}
            {writable ? <DeleteProductButton id={id} hasOrders={product.hasOrders} /> : null}
          </>
        }
      />
      {sp.created ? <p role="status" className="text-sm text-success">Product created.</p> : null}
      {writable ? <ProductMediaManager productId={id} media={product.media} variants={d.variants.filter((v) => v.id).map((v) => ({ id: v.id!, label: variantTitle(v) || "Default" }))} /> : null}
      <ProductEditor initial={d} {...opts} initialCollectionIds={product.collectionIds} canWriteInventory={can(ctx, "inventory.write")} stock={product.stock} />
    </div>
  );
}
