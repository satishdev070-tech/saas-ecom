import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listCollections } from "@/features/catalog/server/collections";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage({ searchParams }: PageProps<"/dashboard/collections">) {
  const ctx = await requireTenantPermission("catalog.read");
  const sp = await searchParams;
  const rows = await listCollections(ctx.tenantId);
  const writable = can(ctx, "catalog.write");
  return (
    <div>
      <PageHeader
        title="Collections"
        description="Group products for merchandising: New Arrivals, Festive Edit, Sale…"
        actions={writable ? <Link href="/dashboard/collections/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Create collection</Link> : null}
      />
      {sp.deleted ? <p role="status" className="mb-4 text-sm text-success">Collection deleted.</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No collections yet" description="Create manual collections or automated ones that fill themselves by rules." />
      ) : (
        <Table caption="Collections">
          <thead>
            <tr>
              <th className={th}>Collection</th>
              <th className={th}>Type</th>
              <th className={th}>Products</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link href={`/dashboard/collections/${c.id}`} className="flex items-center gap-3 font-medium hover:underline">
                    <span className="relative size-10 overflow-hidden rounded bg-border/50">{c.imageUrl ? <Image src={c.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : null}</span>
                    {c.title}
                  </Link>
                </td>
                <td className={td}>{c.type === "automated" ? "Automated" : "Manual"}</td>
                <td className={`${td} tabular-nums`}>{c.productCount}</td>
                <td className={td}>
                  <Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status === "active" ? "Active" : "Draft"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
