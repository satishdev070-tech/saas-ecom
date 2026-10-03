import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listSizeCharts } from "@/features/catalog/server/size-charts";
import { DeleteSizeChart, SizeChartForm } from "@/features/catalog/components/catalog-forms";

export const metadata: Metadata = { title: "Size charts" };

export default async function SizeChartsPage() {
  const ctx = await requireTenantPermission("catalog.read");
  const charts = await listSizeCharts(ctx.tenantId, { withCounts: true });
  const writable = can(ctx, "catalog.write");
  return (
    <div className="space-y-6">
      <PageHeader title="Size charts" description="Shown as the size guide on product pages." />
      {charts.length === 0 && !writable ? <EmptyState title="No size charts yet" /> : null}
      {charts.map((c) => (
        <Card key={c.id} title={c.name} description={`${c.productCount} products · ${c.unit === "cm" ? "centimetres" : "inches"}`} actions={writable ? <DeleteSizeChart id={c.id} name={c.name} /> : null}>
          {writable ? <SizeChartForm value={{ id: c.id, name: c.name, unit: c.unit, chart: c.chart }} /> : <p className="text-sm text-muted">{c.chart.columns.join(" · ")}</p>}
        </Card>
      ))}
      {writable ? (
        <Card title="New size chart">
          <SizeChartForm />
        </Card>
      ) : null}
    </div>
  );
}
