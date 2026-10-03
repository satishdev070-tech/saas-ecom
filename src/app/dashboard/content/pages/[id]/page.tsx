import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getPage } from "@/features/content/queries";
import { DeleteDocument, DocumentEditor } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditDoc({ params, searchParams }: PageProps<"/dashboard/content/pages/[id]">) {
  const ctx = await requireTenantPermission("content.write");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getPage(ctx.tenantId, id);
  if (!d) notFound();
  const seo = (d.seo ?? {}) as { title?: string; description?: string };
  return (
    <div>
      <PageHeader title={d.title} back={<Link href="/dashboard/content/pages" className="text-muted hover:text-foreground">← Pages</Link>} actions={<DeleteDocument table="pages" id={d.id} />} />
      {sp.created ? <p role="status" className="mb-4 text-sm text-success">Created.</p> : null}
      <DocumentEditor
        table="pages"
        value={{
          id: d.id,
          title: d.title,
          slug: d.slug,
          status: d.status,
          blocks: d.blocks,
          seoTitle: seo.title ?? "",
          seoDescription: seo.description ?? "",
          kind: d.kind,
        }}
      />
    </div>
  );
}
