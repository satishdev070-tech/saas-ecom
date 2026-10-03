import type { Metadata } from "next";
import Link from "next/link";
import { Activity, HardDrive, Package, Plus, ShoppingBag, Store, TrendingUp, Users } from "lucide-react";
import { requirePlatform } from "@/lib/platform/access";
import { getPlatformDashboard, getPlatformOverview, getSignupSeries, listAuditLogs, topTenantsThisMonth } from "@/features/platform/server/queries";
import { Card, PageHeader } from "@/components/ui/layout";
import { buttonClass } from "@/components/ui/button";
import { BarList, ColumnChart } from "@/features/platform/components/charts";
import { formatMoney, toMinor } from "@/lib/money";
import { formatBytes } from "@/features/media/rules";

export const metadata: Metadata = { title: "Overview" };

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const compactMoney = (paise: number) => (paise >= 10_000_000 ? `₹${(paise / 10_000_000).toFixed(1)}L` : formatMoney(paise));

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Store; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-small text-muted">{label}</p>
        <Icon aria-hidden className="size-4 text-subtle" strokeWidth={1.75} />
      </div>
      <p className="mt-2 text-h1 tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function AdminHome() {
  const ctx = await requirePlatform("platform.tenants.read");
  const [o, d, weeks, top, activity] = await Promise.all([
    getPlatformOverview(),
    getPlatformDashboard(),
    getSignupSeries(12),
    topTenantsThisMonth("gmv", 6),
    ctx.permissions.has("platform.audit.read") ? listAuditLogs({ page: 1, pageSize: 8 }) : Promise.resolve(null),
  ]);
  const gmv6 = d.monthly.reduce((s, m) => s + m.gmv, 0);
  const statusItems = (["active", "trial", "suspended", "cancelled"] as const).map((s) => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1), value: o.statusCounts[s] }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description={`All stores across the platform · ${new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date())}`}
        actions={
          ctx.permissions.has("platform.tenants.manage") ? (
            <Link href="/admin/tenants/new" className={buttonClass({ variant: "accent" })}>
              <Plus aria-hidden /> New store
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Store} label="Total stores" value={o.totalTenants} hint={`${o.new30d} new in 30 days`} />
        <Kpi icon={Activity} label="Active stores" value={o.statusCounts.active} hint={`${o.statusCounts.suspended} suspended`} />
        <Kpi icon={Package} label="Trial stores" value={o.statusCounts.trial} hint={`${o.trialsEnding7d} ending in 7 days`} />
        <Kpi icon={TrendingUp} label="GMV this month" value={compactMoney(o.monthGmvMinor)} hint="Paid + COD, excl. cancelled" />
        <Kpi icon={ShoppingBag} label="Orders this month" value={o.monthOrders} hint={`${d.orders_all_time} all time`} />
        <Kpi icon={TrendingUp} label="Platform GMV (6 months)" value={compactMoney(gmv6)} />
        <Kpi icon={Users} label="Users" value={d.users_total} hint={`${d.sellers} sellers · ${d.customers} customers · ${d.staff} staff`} />
        <Kpi icon={HardDrive} label="Media storage" value={formatBytes(d.storage_bytes)} hint={`${d.storage_files} files`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Platform GMV" description="Last 6 months" className="lg:col-span-2">
          <ColumnChart ariaLabel="GMV per month" points={d.monthly.map((m) => ({ key: m.month, label: monthFmt.format(new Date(m.month)), value: m.gmv }))} format={compactMoney} height={200} />
        </Card>
        <Card title="Plan distribution" description="Trial and active stores">
          {d.plans.length ? <BarList items={d.plans.map((p) => ({ key: p.name, label: p.name, value: p.count }))} /> : <p className="text-small text-muted">No stores yet.</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New stores" description="Per week, last 12 weeks" className="lg:col-span-2">
          <ColumnChart ariaLabel="New stores per week" points={weeks.map((w) => ({ key: w.key, label: w.label, value: w.value }))} />
        </Card>
        <Card title="Store status">
          <BarList items={statusItems} tone="neutral" />
          {o.customDomainsPending ? (
            <Link href="/admin/domains?status=pending" className="mt-4 block text-small font-medium text-accent hover:underline">
              {o.customDomainsPending} custom {o.customDomainsPending === 1 ? "domain" : "domains"} awaiting verification →
            </Link>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top stores this month" description="By GMV" actions={<Link href="/admin/usage" className="text-small font-medium text-accent hover:underline">Usage</Link>}>
          {top.length ? (
            <ol className="-my-1 divide-y divide-border">
              {top.map((t, i) => (
                <li key={t.tenantId} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 text-caption tabular-nums text-subtle">{i + 1}</span>
                  <Link href={`/admin/tenants/${t.tenantId}`} className="min-w-0 flex-1 truncate text-small font-medium hover:underline">
                    {t.tenantName ?? t.tenantId}
                  </Link>
                  <span className="text-small tabular-nums">{formatMoney(toMinor(t.value))}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-small text-muted">No sales recorded this month yet.</p>
          )}
        </Card>
        {activity ? (
          <Card title="Recent activity" actions={<Link href="/admin/audit" className="text-small font-medium text-accent hover:underline">Audit log</Link>}>
            {activity.rows.length ? (
              <ol className="-my-1 divide-y divide-border">
                {activity.rows.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2.5 text-small">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>
                      {a.tenantName ? <span className="text-muted"> · {a.tenantName}</span> : null}
                      <span className="block truncate text-caption text-muted">{a.actorEmail ?? a.actorType}</span>
                    </span>
                    <time className="shrink-0 text-caption text-subtle" dateTime={a.createdAt}>
                      {timeFmt.format(new Date(a.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-small text-muted">No activity yet.</p>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
