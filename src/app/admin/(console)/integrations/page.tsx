import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { platformIntegrationOverview } from "@/features/integrations/server/store";
import { PROVIDER_IDS, PROVIDERS } from "@/features/integrations/registry";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Store integrations" };

/** Which stores use which providers, and which connections are failing. Status only: never credentials. */
export default async function AdminIntegrationsPage() {
  await requirePlatform("platform.settings.manage");
  const rows = await platformIntegrationOverview();
  const problems = rows.filter((r) => r.status === "error" || r.status === "expired");
  const stat = (id: string) => {
    const r = rows.filter((x) => x.provider === id);
    return { active: r.filter((x) => x.status === "connected" && x.enabled).length, live: r.filter((x) => x.status === "connected" && x.enabled && x.environment === "live").length, problems: r.filter((x) => x.status === "error" || x.status === "expired").length, total: r.length };
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Store integrations" description="Payment, shipping, analytics and social connections across all stores. No API keys, passwords or tokens are shown here." actions={<Link href="/admin/health" className="text-small text-accent hover:underline">Platform configuration →</Link>} />
      <Card title="By provider">
        <Table caption="Integrations by provider">
          <thead>
            <tr>
              <th className={th}>Provider</th>
              <th className={th}>Type</th>
              <th className={`${th} text-right`}>Active stores</th>
              <th className={`${th} text-right`}>Live mode</th>
              <th className={`${th} text-right`}>Failing</th>
              <th className={`${th} text-right`}>Configured</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDER_IDS.map((id) => {
              const s = stat(id);
              return (
                <tr key={id}>
                  <td className={td}>{PROVIDERS[id].label}</td>
                  <td className={`${td} capitalize text-muted`}>{PROVIDERS[id].kind}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.active}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.live}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.problems ? <Badge tone="error">{s.problems}</Badge> : 0}</td>
                  <td className={`${td} text-right tabular-nums`}>{s.total}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card title="Failing connections" description="Stores whose last connection check failed or whose sign-in expired.">
        {problems.length ? (
          <ul className="divide-y divide-border text-small">
            {problems.map((p) => (
              <li key={`${p.tenantId}-${p.provider}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/tenants/${p.tenantId}`} className="font-medium hover:underline">{p.storeName || p.storeSlug}</Link>
                <span className="text-muted">
                  {PROVIDERS[p.provider]?.label ?? p.provider} · <Badge tone={p.status === "expired" ? "warning" : "error"}>{p.status}</Badge>
                  {p.lastVerifiedAt ? ` · ${formatDateTime(p.lastVerifiedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="All connections healthy" description="No store has a failing or expired integration." />
        )}
      </Card>
    </div>
  );
}
