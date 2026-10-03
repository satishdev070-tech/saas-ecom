import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listCategories } from "@/features/catalog/server/categories";
import { categoryLabel } from "@/features/catalog/category-tree";
import { CategoryForm, DeleteCategory } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await requireTenantPermission("catalog.read");
  const cats = await listCategories(ctx.tenantId, { withCounts: true });
  const writable = can(ctx, "catalog.write");
  const parents = cats.map((c) => ({ id: c.id, label: categoryLabel(c) }));
  return (
    <div className="space-y-6">
      <PageHeader title="Categories" description="Your catalogue's navigation tree (e.g. Women › Kurtas › Straight)." />
      {writable ? (
        <Card title="Add category">
          <CategoryForm parents={parents} />
        </Card>
      ) : null}
      {cats.length === 0 ? (
        <EmptyState title="No categories yet" description="Categories power store navigation and filters." />
      ) : (
        <ul className="space-y-2">
          {cats.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface" style={{ marginLeft: `${c.depth * 1.5}rem` }}>
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {c.name} <span className="font-normal text-muted">· {c.productCount} products{c.status === "hidden" ? " · hidden" : ""}</span>
                  </span>
                  <span className="text-xs text-muted">Edit</span>
                </summary>
                <div className="space-y-3 border-t border-border p-4">
                  {writable ? (
                    <>
                      <CategoryForm parents={parents} value={{ id: c.id, name: c.name, slug: c.slug, description: c.description, parentId: c.parentId, status: c.status, position: c.position, seoTitle: c.seoTitle, seoDescription: c.seoDescription, imageUrl: c.imageUrl }} />
                      <DeleteCategory id={c.id} name={c.name} />
                    </>
                  ) : (
                    <p className="text-sm text-muted">/categories/{c.slug}</p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
