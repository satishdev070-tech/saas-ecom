import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { getPost } from "@/features/content/queries";
import { DeleteDocument, DocumentEditor } from "@/features/dashboard-ui/forms";
import { assetUrl } from "@/lib/storage/assets";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditDoc({ params, searchParams }: PageProps<"/dashboard/content/blog/[id]">) {
  const ctx = await requireTenantPermission("content.write");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getPost(ctx.tenantId, id);
  if (!d) notFound();
  const seo = (d.seo ?? {}) as { title?: string; description?: string };
  return (
    <div>
      <PageHeader title={d.title} back={<Link href="/dashboard/content/blog" className="text-muted hover:text-foreground">← Blog</Link>} actions={<DeleteDocument table="blog_posts" id={d.id} />} />
      {sp.created ? <p role="status" className="mb-4 text-sm text-success">Created.</p> : null}
      <DocumentEditor
        table="blog_posts"
        value={{
          id: d.id,
          title: d.title,
          slug: d.slug,
          status: d.status,
          blocks: d.blocks,
          seoTitle: seo.title ?? "",
          seoDescription: seo.description ?? "",
          excerpt: d.excerpt ?? "", authorName: d.author_name ?? "", tags: d.tags.join(", "), coverUrl: assetUrl(d.cover_path),
        }}
      />
    </div>
  );
}
