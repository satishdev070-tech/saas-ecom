import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { PageHeader } from "@/components/ui/layout";
import { listIntegrationSummaries, toCardData } from "@/features/integrations/server/store";
import { IntegrationCard } from "@/features/integrations/components/integration-card";

export const metadata: Metadata = { title: "Analytics & tracking" };

export default async function AnalyticsSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const summaries = await listIntegrationSummaries(ctx.tenantId, "tracking");
  const w = can(ctx, "settings.write");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & tracking"
        description="Your storefront loads these tags only after you save and enable them. E-commerce events (view_item, add_to_cart, begin_checkout, purchase and more) are sent automatically."
      />
      {summaries.map((s) => (
        <IntegrationCard key={s.provider} data={toCardData(s)} canManage={w} />
      ))}
      <p className="text-caption text-muted">
        Campaign parameters (utm_source, utm_medium, utm_campaign, gclid, fbclid) are captured on the first visit and saved on the order and customer, visible on each order.
      </p>
    </div>
  );
}
