import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { DocumentEditor } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "New page" };

export default async function NewDoc() {
  await requireTenantPermission("content.write");
  return (
    <div>
      <PageHeader title="New page" back={<Link href="/dashboard/content/pages" className="text-muted hover:text-foreground">← Pages</Link>} />
      <DocumentEditor table="pages" value={{ title: "", slug: "", status: "draft", blocks: [], seoTitle: "", seoDescription: "" }} />
    </div>
  );
}
