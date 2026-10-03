import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { AUDIT_ACTOR_TYPES, auditFilterSchema } from "@/features/platform/schemas";
import { listAuditLogs } from "@/features/platform/server/queries";
import { PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Audit log" };
const ctl = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePlatform("platform.audit.read");
  const f = auditFilterSchema.parse(await searchParams);
  const { rows, hasMore } = await listAuditLogs(f);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tenant: f.tenant, action: f.action, actor: f.actor, actorType: f.actorType, from: f.from, to: f.to })) if (v) p.set(k, v);
    p.set("page", String(page));
    return `/admin/audit?${p}`;
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Sensitive actions across every store and the platform. Dates are India time." />
      <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7" role="search">
        {f.tenant ? <input type="hidden" name="tenant" value={f.tenant} /> : null}
        <label className="sr-only" htmlFor="action">
          Action
        </label>
        <input id="action" name="action" defaultValue={f.action ?? ""} placeholder="Action, e.g. order.cancelled" className={`${ctl} lg:col-span-2`} />
        <label className="sr-only" htmlFor="actor">
          Actor
        </label>
        <input id="actor" name="actor" defaultValue={f.actor ?? ""} placeholder="Actor email or id" className={`${ctl} lg:col-span-2`} />
        <label className="sr-only" htmlFor="actorType">
          Actor type
        </label>
        <select id="actorType" name="actorType" defaultValue={f.actorType ?? ""} className={ctl}>
          <option value="">Any actor</option>
          {AUDIT_ACTOR_TYPES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="from">
          From
        </label>
        <input id="from" type="date" name="from" defaultValue={f.from ?? ""} className={ctl} />
        <label className="sr-only" htmlFor="to">
          To
        </label>
        <input id="to" type="date" name="to" defaultValue={f.to ?? ""} className={ctl} />
        <button className={ctl}>Filter</button>
      </form>
      {f.tenant ? (
        <p className="text-sm">
          Filtered to one store ·{" "}
          <Link href="/admin/audit" className="underline">
            clear
          </Link>
        </p>
      ) : null}
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Action</th>
              <th className={th}>Actor</th>
              <th className={th}>Store</th>
              <th className={th}>Entity</th>
              <th className={th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(a.createdAt)}</td>
                <td className={td}>
                  <code className="text-xs">{a.action}</code>
                </td>
                <td className={td}>
                  {a.actorEmail ?? "—"}
                  <p className="text-xs text-muted">{a.actorType}</p>
                </td>
                <td className={td}>{a.tenantId ? <Link href={`/admin/tenants/${a.tenantId}`} className="hover:underline">{a.tenantName ?? "store"}</Link> : "Platform"}</td>
                <td className={`${td} text-xs`}>{a.entityType ? `${a.entityType}${a.entityId ? ` · ${a.entityId.slice(0, 12)}` : ""}` : "—"}</td>
                <td className={td}>
                  {a.metadata && typeof a.metadata === "object" && Object.keys(a.metadata).length ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-accent">View</summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(a.metadata, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No matching entries" />
      )}
      <nav className="flex justify-between text-sm" aria-label="Pagination">
        {f.page > 1 ? <Link href={qs(f.page - 1)}>← Newer</Link> : <span />}
        {hasMore ? <Link href={qs(f.page + 1)}>Older →</Link> : null}
      </nav>
    </div>
  );
}
