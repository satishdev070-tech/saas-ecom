import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { requirePlatform } from "@/lib/platform/access";
import { STORE_SORTS, STORE_TYPE_LABEL, STORE_TYPES, storeListFilterSchema } from "@/features/platform/schemas";
import { listPlans, listStores } from "@/features/platform/server/queries";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatDateTime } from "@/features/analytics/dates";
import { formatMoney } from "@/lib/money";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";

export const metadata: Metadata = { title: "Stores" };
const TONE = { trial: "accent", active: "success", suspended: "error", cancelled: "neutral" } as const;
const ctl = "h-9 rounded-md border border-border bg-surface px-3 text-small";
const TYPE_TONE = { real: "success", demo: "info", test: "warning" } as const;
const SORT_LABEL: Record<(typeof STORE_SORTS)[number], string> = { newest: "Newest", oldest: "Oldest", revenue: "Revenue", orders: "Orders", products: "Products", activity: "Last activity" };

export default async function StoresPage({ searchParams }: PageProps<"/admin/stores">) {
  const ctx = await requirePlatform("platform.tenants.read");
  const f = storeListFilterSchema.parse(await searchParams);
  const [{ rows, total, categories }, plans] = await Promise.all([listStores(f), listPlans()]);
  // Store type / category exist only once migration 1800 is applied (categories !== null).
  const typed = categories !== null;
  const type = typed ? f.type : undefined;
  const category = typed ? f.category : undefined;
  const filtered = Boolean(f.q || f.status || f.plan || f.from || f.to || type || category);
  return (
    <div>
      <PageHeader
        title="Stores"
        description={`${total} store${total === 1 ? "" : "s"}${filtered ? " match your filters" : " on the platform"}`}
        actions={
          ctx.permissions.has("platform.tenants.manage") ? (
            <Link href="/admin/tenants/new" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground">
              New store
            </Link>
          ) : null
        }
      />
      <form className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-end" role="search">
        <div className="relative sm:min-w-72 sm:flex-1">
          <label className="sr-only" htmlFor="q">Search stores</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="q" name="q" defaultValue={f.q ?? ""} placeholder="Store, owner email, domain or tenant ID" className={`${ctl} w-full pl-9`} />
        </div>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={f.status ?? ""} className={ctl}>
          <option value="">All statuses</option>
          {Object.keys(TONE).map((s) => (
            <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="plan">Plan</label>
        <select id="plan" name="plan" defaultValue={f.plan ?? ""} className={ctl}>
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {typed ? (
          <>
            <label className="sr-only" htmlFor="type">Store type</label>
            <select id="type" name="type" defaultValue={type ?? ""} className={ctl}>
              <option value="">All types</option>
              {STORE_TYPES.map((s) => (
                <option key={s} value={s}>{STORE_TYPE_LABEL[s]}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={category ?? ""} className={ctl}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        ) : null}
        <label className="flex items-center gap-1 text-caption text-muted">
          From <input type="date" name="from" defaultValue={f.from ?? ""} className={ctl} />
        </label>
        <label className="flex items-center gap-1 text-caption text-muted">
          To <input type="date" name="to" defaultValue={f.to ?? ""} className={ctl} />
        </label>
        <label className="sr-only" htmlFor="sort">Sort</label>
        <select id="sort" name="sort" defaultValue={f.sort} className={ctl}>
          {STORE_SORTS.map((s) => (
            <option key={s} value={s}>Sort: {SORT_LABEL[s]}</option>
          ))}
        </select>
        <button className={`${ctl} font-medium`}>Apply</button>
        {filtered ? <Link href="/admin/stores" className="text-small text-accent hover:underline">Clear</Link> : null}
      </form>
      {rows.length ? (
        <Table caption="Stores">
          <thead>
            <tr>
              <th className={th}>Store</th>
              {typed ? <th className={th}>Type</th> : null}
              {typed ? <th className={th}>Category</th> : null}
              <th className={th}>Owner</th>
              <th className={th}>Plan</th>
              <th className={th}>Status</th>
              <th className={th}>Domain</th>
              <th className={`${th} text-right`}>Products</th>
              <th className={`${th} text-right`}>Orders</th>
              <th className={`${th} text-right`}>Customers</th>
              <th className={`${th} text-right`}>Revenue</th>
              <th className={th}>Created</th>
              <th className={th}>Last activity</th>
              <th className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const host = t.primaryDomain ?? storeSubdomain(t.slug);
              return (
                <tr key={t.id}>
                  <td className={td}>
                    <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                    <p className="font-mono text-caption text-muted" title={t.id}>{t.slug}</p>
                  </td>
                  {typed ? <td className={td}>{t.storeType ? <Badge tone={TYPE_TONE[t.storeType]}>{STORE_TYPE_LABEL[t.storeType]}</Badge> : "—"}</td> : null}
                  {typed ? <td className={`${td} max-w-44 truncate`} title={t.categoryName ?? undefined}>{t.categoryName ?? <span className="text-muted">—</span>}</td> : null}
                  <td className={`${td} max-w-52 truncate`} title={t.ownerEmail ?? undefined}>{t.ownerEmail ?? <span className="text-muted">No owner</span>}</td>
                  <td className={td}>{t.planName ?? "—"}</td>
                  <td className={td}><Badge tone={TONE[t.status]}>{t.status}</Badge></td>
                  <td className={`${td} max-w-48 truncate text-muted`}>{host}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.products}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.orders}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.customers}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(t.revenueMinor)}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(t.createdAt)}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{t.lastActivity ? formatDateTime(t.lastActivity) : "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/tenants/${t.id}`} className="text-small text-accent hover:underline">Manage</Link>
                      <a href={storeOrigin(host)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${t.name} storefront`} className="text-muted hover:text-foreground">
                        <ExternalLink className="size-4" aria-hidden />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title={filtered ? "No stores match" : "No stores yet"} description={filtered ? "Try a different search or clear the filters." : "Stores appear here as sellers sign up."} />
      )}
      <Pagination page={f.page} pageSize={f.pageSize} total={total} basePath="/admin/stores" params={{ q: f.q, status: f.status, plan: f.plan, from: f.from, to: f.to, sort: f.sort === "newest" ? undefined : f.sort, type, category }} />
    </div>
  );
}
