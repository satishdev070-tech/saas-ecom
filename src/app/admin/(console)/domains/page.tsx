import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { domainFilterSchema } from "@/features/platform/schemas";
import { customDomainStatusCounts, listAllCustomDomains } from "@/features/platform/server/queries";
import { DomainStatusBadge, SslStatusBadge } from "@/features/domains/components/domain-display";
import { RecheckDomainButton } from "@/features/platform/components/admin-forms";
import { PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Domains" };
const ctl = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export default async function DomainsPage({ searchParams }: PageProps<"/admin/domains">) {
  const ctx = await requirePlatform("platform.tenants.read");
  const f = domainFilterSchema.parse(await searchParams);
  const [{ rows, total }, counts] = await Promise.all([listAllCustomDomains(f), customDomainStatusCounts()]);
  const manage = ctx.permissions.has("platform.tenants.manage");
  return (
    <div className="space-y-6">
      <PageHeader title="Custom domains" description="Every store's connected domains. Verification runs on a schedule; re-check to run it now." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Verified" value={counts.verified} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Failed" value={counts.failed} />
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="q">
          Search
        </label>
        <input id="q" name="q" defaultValue={f.q ?? ""} placeholder="Hostname" className={`${ctl} min-w-48 flex-1`} />
        <label className="sr-only" htmlFor="status">
          Status
        </label>
        <select id="status" name="status" defaultValue={f.status ?? ""} className={ctl}>
          <option value="">All statuses</option>
          {["pending", "verified", "failed", "removed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className={ctl}>Filter</button>
      </form>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Hostname</th>
              <th className={th}>Store</th>
              <th className={th}>Status</th>
              <th className={th}>SSL</th>
              <th className={th}>Last check</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  {d.hostname}
                  {d.lastError ? <p className="text-xs text-error">{d.lastError}</p> : null}
                </td>
                <td className={td}>
                  <Link href={`/admin/tenants/${d.tenantId}`} className="hover:underline">
                    {d.tenantName ?? d.tenantSlug ?? d.tenantId}
                  </Link>
                </td>
                <td className={td}>
                  <DomainStatusBadge status={d.status} />
                </td>
                <td className={td}>
                  <SslStatusBadge status={d.sslStatus} />
                </td>
                <td className={td}>{formatDateTime(d.lastCheckedAt)}</td>
                <td className={td}>{manage && d.status !== "removed" ? <RecheckDomainButton domainId={d.id} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No custom domains" />
      )}
      <Pagination page={f.page} pageSize={f.pageSize} total={total} basePath="/admin/domains" params={{ q: f.q, status: f.status }} />
    </div>
  );
}
