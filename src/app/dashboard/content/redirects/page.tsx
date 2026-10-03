import type { Metadata } from "next";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listRedirects } from "@/features/content/queries";
import { DeleteRow, RowForm } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "URL redirects" };

export default async function RowsPage() {
  const ctx = await requireTenantPermission("content.write");
  const rows = await listRedirects(ctx.tenantId);
  return (
    <div className="space-y-6">
      <PageHeader title="URL redirects" />
      <Card title="Add">
        <RowForm kind="redirect" />
      </Card>
      {rows.length === 0 ? <EmptyState title="Nothing added yet" /> : null}
      {rows.map((r) => {
        const flat = { ...r, ...(("address" in r && r.address && typeof r.address === "object" ? r.address : {}) as Record<string, string>) } as unknown as Record<string, string | number | boolean | null>;
        return (
          <details key={r.id} className="rounded-lg border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{String(flat.question ?? flat.name ?? `${flat.from_path} → ${flat.to_path}`)}</summary>
            <div className="space-y-3 border-t border-border p-4">
              <RowForm kind="redirect" value={flat} />
              <DeleteRow kind="redirect" id={r.id} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
