import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { DocumentEditor } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "New post" };

export default async function NewDoc() {
  await requireTenantPermission("content.write");
  return (
    <div>
      <PageHeader title="New post" back={<Link href="/dashboard/content/blog" className="text-muted hover:text-foreground">← Blog</Link>} />
      <DocumentEditor table="blog_posts" value={{ title: "", slug: "", status: "draft", blocks: [], seoTitle: "", seoDescription: "" }} />
    </div>
  );
}
