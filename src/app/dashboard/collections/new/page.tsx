import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { CollectionForm } from "@/features/catalog/components/catalog-forms";
import { EMPTY_RULES } from "@/features/catalog/collection-rules";
import { collectionFormOptions } from "../form-data";

export const metadata: Metadata = { title: "Create collection" };

export default async function NewCollection() {
  const ctx = await requireTenantPermission("catalog.write");
  const opts = await collectionFormOptions(ctx.tenantId);
  return (
    <div>
      <PageHeader title="Create collection" back={<Link href="/dashboard/collections" className="text-muted hover:text-foreground">← Collections</Link>} />
      <CollectionForm
        value={{ title: "", slug: "", description: "", type: "manual", status: "active", sortOrder: "manual", rules: EMPTY_RULES, seoTitle: "", seoDescription: "", imageUrl: null, productIds: [] }}
        {...opts}
      />
    </div>
  );
}
