import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { getInventoryItem, listMovements } from "@/features/inventory/server/inventory";
import { INVENTORY_REASON_LABELS, MOVEMENT_PAGE_SIZE } from "@/features/catalog/constants";
import { StockActions } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Stock history" };

export default async function VariantStockPage({ params, searchParams }: PageProps<"/dashboard/inventory/[variantId]">) {
  const ctx = await requireTenantPermission("inventory.read");
  const { variantId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const [item, moves] = await Promise.all([getInventoryItem(ctx.tenantId, variantId), listMovements(ctx.tenantId, variantId, page)]);
  if (!item) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title={item.productTitle}
        description={`${item.variantTitle}${item.sku ? ` · ${item.sku}` : ""}`}
        back={<Link href="/dashboard/inventory" className="text-muted hover:text-foreground">← Inventory</Link>}
        actions={can(ctx, "inventory.write") ? <StockActions variantId={variantId} available={item.available} threshold={item.threshold} /> : null}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={item.available} />
        <StatCard label="Reserved" value={item.reserved} hint="Held for unpaid online orders" />
        <StatCard label="Low-stock alert at" value={item.threshold} />
      </div>
      {moves.rows.length === 0 ? (
        <EmptyState title="No stock movements yet" />
      ) : (
        <>
          <Table caption="Stock movements">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Change</th>
                <th className={th}>After</th>
                <th className={th}>Reason</th>
                <th className={th}>By</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {moves.rows.map((m) => (
                <tr key={m.id}>
                  <td className={td}>{new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className={`${td} tabular-nums ${m.delta > 0 ? "text-success" : "text-error"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className={`${td} tabular-nums`}>{m.availableAfter}</td>
                  <td className={td}>
                    {INVENTORY_REASON_LABELS[m.reason as keyof typeof INVENTORY_REASON_LABELS] ?? m.reason}
                    {m.referenceType === "order" && m.referenceId ? (
                      <Link href={`/dashboard/orders/${m.referenceId}`} className="ml-1 text-xs text-accent">
                        order
                      </Link>
                    ) : null}
                  </td>
                  <td className={td}>{m.createdByName ?? "System"}</td>
                  <td className={td}>{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={MOVEMENT_PAGE_SIZE} total={moves.total} basePath={`/dashboard/inventory/${variantId}`} />
        </>
      )}
    </div>
  );
}
