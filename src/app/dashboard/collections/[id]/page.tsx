import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getCollection } from "@/features/catalog/server/collections";
import { CollectionForm, DeleteCollection } from "@/features/catalog/components/catalog-forms";
import { collectionFormOptions } from "../form-data";

export const metadata: Metadata = { title: "Edit collection" };

export default async function EditCollection({ params, searchParams }: PageProps<"/dashboard/collections/[id]">) {
  const ctx = await requireTenantPermission("catalog.read");
  const { id } = await params;
  const sp = await searchParams;
  const [c, opts] = await Promise.all([getCollection(ctx.tenantId, id), collectionFormOptions(ctx.tenantId)]);
  if (!c) notFound();
  return (
    <div>
      <PageHeader title={c.title} back={<Link href="/dashboard/collections" className="text-muted hover:text-foreground">← Collections</Link>} actions={can(ctx, "catalog.write") ? <DeleteCollection id={c.id} /> : null} />
      {sp.created ? <p role="status" className="mb-4 text-sm text-success">Collection created.</p> : null}
      <CollectionForm value={{ id: c.id, title: c.title, slug: c.slug, description: c.description, type: c.type, status: c.status, sortOrder: c.sortOrder, rules: c.rules, seoTitle: c.seoTitle, seoDescription: c.seoDescription, imageUrl: c.imageUrl, productIds: c.productIds }} {...opts} />
    </div>
  );
}
