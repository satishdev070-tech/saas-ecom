import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listPages } from "@/features/content/queries";
import { formatDate } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Pages" };

export default async function ContentList() {
  const ctx = await requireTenantPermission("content.write");
  const rows = await listPages(ctx.tenantId);
  return (
    <div>
      <PageHeader title="Pages" actions={<Link href="/dashboard/content/pages/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">New page</Link>} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing here yet" description="Add About, Shipping, Returns and other policy pages." />
      ) : (
        <Table caption="Pages">
          <thead>
            <tr><th className={th}>Title</th><th className={th}>URL</th><th className={th}>Status</th><th className={th}>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}><Link href={`/dashboard/content/pages/${r.id}`} className="font-medium hover:underline">{r.title}</Link></td>
                <td className={`${td} text-xs text-muted`}>/pages/{r.slug}</td>
                <td className={td}><Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Badge></td>
                <td className={td}>{formatDate(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
