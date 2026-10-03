import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney } from "@/lib/money";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { SelectField, TextField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/states";
import { FilterBar, queryString } from "@/features/settings/ui/filter-bar";
import { listProducts } from "@/features/catalog/server/products";
import { listCategories } from "@/features/catalog/server/categories";
import { listCollectionOptions } from "@/features/catalog/server/collections";
import { productListQuerySchema, PRODUCT_SORT_LABELS, PRODUCT_SORTS } from "@/features/catalog/schemas";
import { PRODUCT_PAGE_SIZE, PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE, PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/features/catalog/constants";
import { categoryLabel } from "@/features/catalog/category-tree";
import { ProductBulkBar } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/products">) {
  const ctx = await requireTenantPermission("catalog.read");
  const sp = await searchParams;
  const f = productListQuerySchema.parse(sp);
  const [{ rows, total }, categories, collections] = await Promise.all([listProducts(ctx.tenantId, f), listCategories(ctx.tenantId), listCollectionOptions(ctx.tenantId)]);
  const params = { q: f.q, status: f.status, type: f.type, category: f.category, collection: f.collection, sort: f.sort };
  const filtered = Boolean(f.q || f.status || f.type || f.category || f.collection);
  const writable = can(ctx, "catalog.write");
  return (
    <div>
      <PageHeader
        title="Products"
        description={`${total} ${total === 1 ? "product" : "products"}`}
        actions={
          <>
            <a href={`/dashboard/products/export${queryString(params)}`} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium" download>
              Export CSV
            </a>
            {writable ? (
              <>
                <Link href="/dashboard/products/import" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium">
                  Import
                </Link>
                <Link href="/dashboard/products/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                  Add product
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {sp.deleted ? <p role="status" className="mb-4 text-sm text-success">Product deleted.</p> : null}
      <FilterBar action="/dashboard/products" resetHref="/dashboard/products" label="Filter products">
        <TextField label="Search" name="q" type="search" defaultValue={f.q ?? ""} placeholder="Title or SKU" className="sm:col-span-2" />
        <SelectField label="Status" name="status" defaultValue={f.status ?? ""} options={[{ value: "", label: "Any status" }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))]} />
        <SelectField label="Type" name="type" defaultValue={f.type ?? ""} options={[{ value: "", label: "Any type" }, ...PRODUCT_TYPES.map((t) => ({ value: t, label: PRODUCT_TYPE_LABELS[t] }))]} />
        <SelectField label="Category" name="category" defaultValue={f.category ?? ""} options={[{ value: "", label: "Any category" }, ...categories.map((c) => ({ value: c.id, label: categoryLabel(c) }))]} />
        <SelectField label="Collection" name="collection" defaultValue={f.collection ?? ""} options={[{ value: "", label: "Any collection" }, ...collections.map((c) => ({ value: c.id, label: c.title }))]} />
        <SelectField label="Sort" name="sort" defaultValue={f.sort} options={PRODUCT_SORTS.map((s) => ({ value: s, label: PRODUCT_SORT_LABELS[s] }))} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No products match these filters" : "Add your first product"}
          description={filtered ? "Try a different search or clear the filters." : "Products appear on your storefront once they're active."}
          action={!filtered && writable ? <Link href="/dashboard/products/new" className="text-sm font-medium text-accent">Add product →</Link> : undefined}
        />
      ) : (
        <>
          {writable ? (
            <div className="mb-3">
              <ProductBulkBar formId="bulk-products" />
            </div>
          ) : null}
          <form id="bulk-products">
            <Table caption="Products">
              <thead>
                <tr>
                  {writable ? <th className={th}><span className="sr-only">Select</span></th> : null}
                  <th className={th}>Product</th>
                  <th className={th}>Status</th>
                  <th className={th}>Type</th>
                  <th className={th}>Price</th>
                  <th className={th}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    {writable ? (
                      <td className={td}>
                        <input type="checkbox" name="ids[]" value={p.id} aria-label={`Select ${p.title}`} />
                      </td>
                    ) : null}
                    <td className={td}>
                      <Link href={`/dashboard/products/${p.id}`} className="flex items-center gap-3 font-medium hover:underline">
                        <span className="relative size-10 shrink-0 overflow-hidden rounded bg-border/50">{p.thumbUrl ? <Image src={p.thumbUrl} alt="" fill sizes="40px" className="object-cover" /> : null}</span>
                        <span>
                          {p.title}
                          {p.categoryName ? <span className="block text-xs font-normal text-muted">{p.categoryName}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className={td}>
                      <Badge tone={PRODUCT_STATUS_TONE[p.status as keyof typeof PRODUCT_STATUS_TONE] ?? "neutral"}>{PRODUCT_STATUS_LABELS[p.status as keyof typeof PRODUCT_STATUS_LABELS] ?? p.status}</Badge>
                    </td>
                    <td className={td}>{PRODUCT_TYPE_LABELS[p.productType as keyof typeof PRODUCT_TYPE_LABELS] ?? p.productType}</td>
                    <td className={`${td} tabular-nums`}>{p.minPrice === null ? "—" : p.maxPrice !== null && p.maxPrice !== p.minPrice ? `${formatMoney(p.minPrice)} – ${formatMoney(p.maxPrice)}` : formatMoney(p.minPrice)}</td>
                    <td className={`${td} tabular-nums`}>{p.stockTotal === null ? "Not tracked" : `${p.stockTotal} in ${p.variantCount} variant${p.variantCount === 1 ? "" : "s"}`}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </form>
          <Pagination page={f.page} pageSize={PRODUCT_PAGE_SIZE} total={total} basePath="/dashboard/products" params={{ ...params, sort: f.sort }} />
        </>
      )}
    </div>
  );
}
