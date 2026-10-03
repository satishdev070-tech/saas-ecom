import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { formatMoney } from "@/lib/money";
import { Card, PageHeader, StatCard, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { getAnalyticsReport } from "@/features/analytics/queries";
import { RANGE_PRESETS, resolveDateRange } from "@/features/analytics/dates";
import { zeroFillDays } from "@/features/analytics/metrics";
import { RevenueChart } from "@/features/analytics/components/revenue-chart";

export const metadata: Metadata = { title: "Analytics" };

const RANGE_LABEL: Record<string, string> = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
const FUNNEL_LABEL: Record<string, string> = { page_view: "Visited", product_view: "Viewed a product", add_to_cart: "Added to bag", begin_checkout: "Started checkout", purchase: "Purchased" };

export default async function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  const ctx = await requireTenantPermission("analytics.read");
  const sp = await searchParams;
  const range = resolveDateRange({ range: typeof sp.range === "string" ? sp.range : null, from: typeof sp.from === "string" ? sp.from : null, to: typeof sp.to === "string" ? sp.to : null });
  const r = await getAnalyticsReport(ctx.tenantId, range);
  const visits = r.funnel.find((f) => f.event_name === "page_view")?.sessions ?? 0;
  const buyers = r.funnel.find((f) => f.event_name === "purchase")?.sessions ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description={range.label} />
      <nav aria-label="Date range" className="flex flex-wrap gap-2 text-sm">
        {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={`/dashboard/analytics?range=${p}`} aria-current={range.preset === p ? "page" : undefined} className={`rounded-md border px-3 py-1.5 ${range.preset === p ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            {RANGE_LABEL[p]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(r.totals.revenueMinor)} />
        <StatCard label="Orders" value={r.totals.orders} />
        <StatCard label="Average order" value={formatMoney(r.totals.aovMinor)} />
        <StatCard label="Conversion" value={visits ? `${((buyers / visits) * 100).toFixed(1)}%` : "—"} hint="Sessions that purchased" />
      </div>
      <Card title="Revenue by day">
        {r.totals.orders === 0 ? <EmptyState title="No sales in this period" description="Revenue appears here as soon as orders are placed." /> : <RevenueChart days={zeroFillDays(r.days, range.fromKey, range.toKey)} />}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top products">
          {r.topProducts.length ? (
            <Table caption="Top products">
              <thead><tr><th className={th}>Product</th><th className={th}>Units</th><th className={th}>Revenue</th></tr></thead>
              <tbody>
                {r.topProducts.map((p) => (
                  <tr key={p.product_id}><td className={td}>{p.title}</td><td className={`${td} tabular-nums`}>{p.units}</td><td className={`${td} tabular-nums`}>{formatMoney(p.revenueMinor)}</td></tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted">No sales yet.</p>
          )}
        </Card>
        <Card title="Shopper funnel" description="Unique sessions reaching each step">
          <ol className="space-y-2">
            {["page_view", "product_view", "add_to_cart", "begin_checkout", "purchase"].map((k) => {
              const s = r.funnel.find((f) => f.event_name === k)?.sessions ?? 0;
              return (
                <li key={k}>
                  <div className="flex justify-between text-sm"><span>{FUNNEL_LABEL[k]}</span><span className="tabular-nums">{s}</span></div>
                  <div className="mt-1 h-2 rounded bg-border/60"><div className="h-2 rounded bg-accent" style={{ width: `${visits ? Math.min(100, (s / visits) * 100) : 0}%` }} /></div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
      <Card title="Top pages">
        {r.pages.length ? (
          <Table caption="Top pages">
            <thead><tr><th className={th}>Path</th><th className={th}>Views</th><th className={th}>Sessions</th></tr></thead>
            <tbody>
              {r.pages.map((p) => (
                <tr key={p.path}><td className={`${td} font-mono text-xs`}>{p.path}</td><td className={`${td} tabular-nums`}>{p.views}</td><td className={`${td} tabular-nums`}>{p.sessions}</td></tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">No traffic recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
