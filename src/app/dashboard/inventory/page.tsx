import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { Badge, PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { SelectField, TextField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar } from "@/features/settings/ui/filter-bar";
import { inventorySummary, listInventory } from "@/features/inventory/server/inventory";
import { inventoryListQuerySchema } from "@/features/inventory/schemas";
import { INVENTORY_PAGE_SIZE } from "@/features/catalog/constants";
import { StockActions } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/dashboard/inventory">) {
  const ctx = await requireTenantPermission("inventory.read");
  const f = inventoryListQuerySchema.parse(await searchParams);
  const [{ rows, total }, summary] = await Promise.all([listInventory(ctx.tenantId, f), inventorySummary(ctx.tenantId)]);
  const writable = can(ctx, "inventory.write");
  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Stock per variant at your default location. Every change is recorded." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tracked variants" value={summary.tracked} />
        <StatCard label="Low stock" value={summary.low} />
        <StatCard label="Out of stock" value={summary.out} />
      </div>
      <FilterBar action="/dashboard/inventory" resetHref="/dashboard/inventory" label="Filter inventory">
        <TextField label="Search" name="q" type="search" defaultValue={f.q ?? ""} placeholder="Product or SKU" className="sm:col-span-2" />
        <SelectField label="Stock" name="stock" defaultValue={f.stock} options={[{ value: "all", label: "All" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }, { value: "untracked", label: "Not tracked" }]} />
        <SelectField label="Sort" name="sort" defaultValue={f.sort} options={[{ value: "product", label: "Product" }, { value: "available_asc", label: "Lowest stock" }, { value: "available_desc", label: "Highest stock" }, { value: "sku", label: "SKU" }]} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to show" description="Add products with inventory tracking to see stock here." />
      ) : (
        <>
          <Table caption="Inventory">
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>SKU</th>
                <th className={th}>Available</th>
                <th className={th}>Reserved</th>
                <th className={th}>Status</th>
                {writable ? <th className={th}><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId}>
                  <td className={td}>
                    <Link href={`/dashboard/inventory/${r.variantId}`} className="font-medium hover:underline">
                      {r.productTitle}
                    </Link>
                    <span className="block text-xs text-muted">{r.variantTitle}</span>
                  </td>
                  <td className={`${td} font-mono text-xs`}>{r.sku ?? "—"}</td>
                  <td className={`${td} tabular-nums`}>{r.trackInventory ? r.available : "∞"}</td>
                  <td className={`${td} tabular-nums`}>{r.reserved}</td>
                  <td className={td}>{!r.trackInventory ? <Badge>Not tracked</Badge> : r.outOfStock ? <Badge tone="error">Out of stock</Badge> : r.lowStock ? <Badge tone="warning">Low</Badge> : <Badge tone="success">In stock</Badge>}</td>
                  {writable ? (
                    <td className={td}>
                      <StockActions variantId={r.variantId} available={r.available} threshold={r.threshold} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} pageSize={INVENTORY_PAGE_SIZE} total={total} basePath="/dashboard/inventory" params={{ q: f.q, stock: f.stock, sort: f.sort }} />
        </>
      )}
    </div>
  );
}
