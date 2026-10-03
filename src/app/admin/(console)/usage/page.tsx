import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { getStorageUsage, getTenantsLite, topTenantsThisMonth } from "@/features/platform/server/queries";
import { formatBytes } from "@/features/platform/health";
import { percentOfLimit, storageLimitBytes } from "@/features/platform/stats";
import { planLimitValue } from "@/features/platform/schemas";
import { Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { formatMoney, toMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Usage & storage" };

export default async function UsagePage() {
  await requirePlatform("platform.usage.read");
  const [storage, gmv, orders] = await Promise.all([getStorageUsage(null, 50), topTenantsThisMonth("gmv", 10), topTenantsThisMonth("orders", 10)]);
  const tenants = await getTenantsLite(storage.map((s) => s.tenantId));
  const total = storage.reduce((a, s) => a + s.bytes, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Usage & storage" description={`Top stores by storage (${formatBytes(total)} across the top ${storage.length}).`} />
      <Card title="Storage by store">
        <Table>
          <thead>
            <tr>
              <th className={th}>Store</th>
              <th className={`${th} text-right`}>Files</th>
              <th className={`${th} text-right`}>Used</th>
              <th className={`${th} text-right`}>Of plan limit</th>
            </tr>
          </thead>
          <tbody>
            {storage.map((s) => {
              const t = tenants.get(s.tenantId);
              const pct = percentOfLimit(s.bytes, storageLimitBytes(planLimitValue(t?.limits ?? null, "storage_mb")));
              return (
                <tr key={s.tenantId}>
                  <td className={td}>
                    <Link href={`/admin/tenants/${s.tenantId}`} className="font-medium hover:underline">
                      {t?.name ?? s.tenantId}
                    </Link>
                    <p className="text-xs text-muted">{t?.planName ?? "No plan"}</p>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{s.files}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatBytes(s.bytes)}</td>
                  <td className={`${td} text-right tabular-nums ${pct !== null && pct >= 90 ? "text-error" : ""}`}>{pct === null ? "—" : `${pct}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { title: "GMV this month", rows: gmv, fmt: (v: number) => formatMoney(toMinor(v)) },
          { title: "Orders this month", rows: orders, fmt: (v: number) => String(v) },
        ].map((b) => (
          <Card key={b.title} title={b.title}>
            {b.rows.length ? (
              <ol className="divide-y divide-border text-sm">
                {b.rows.map((r) => (
                  <li key={r.tenantId} className="flex justify-between py-2">
                    <Link href={`/admin/tenants/${r.tenantId}`} className="hover:underline">
                      {r.tenantName ?? r.tenantId}
                    </Link>
                    <span className="tabular-nums">{b.fmt(r.value)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nothing recorded yet.</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
