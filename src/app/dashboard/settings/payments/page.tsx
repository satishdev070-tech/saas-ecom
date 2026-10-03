import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { storeOrigin } from "@/lib/platform/urls";
import { PageHeader } from "@/components/ui/layout";
import { listIntegrationSummaries, storePrimaryHost, toCardData } from "@/features/integrations/server/store";
import { IntegrationCard } from "@/features/integrations/components/integration-card";
import type { ProviderId } from "@/features/integrations/registry";

export const metadata: Metadata = { title: "Payments" };

const WEBHOOK_HELP: Partial<Record<ProviderId, string>> = {
  razorpay: "Razorpay Dashboard → Account & Settings → Webhooks. Events: payment.captured, payment.failed, refund.processed. Use the same webhook secret as above.",
  cashfree: "Cashfree Dashboard → Developers → Webhooks (Payment Gateway). Also sent automatically as notify_url on every order. Signed with your Secret Key.",
  payu: "PayU Dashboard → Developers → Webhooks, event “Successful payment” and “Failed payment”. Hash-verified with your Salt.",
};

export default async function PaymentsPage() {
  const ctx = await requireTenantPermission("payments.manage");
  const [summaries, host] = await Promise.all([listIntegrationSummaries(ctx.tenantId, "payment"), storePrimaryHost(ctx.tenantId)]);
  const manage = can(ctx, "payments.manage");
  const connected = summaries.filter((s) => s.enabled && s.status === "connected").length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={
          <>
            Connect your own gateway accounts. Shoppers pick from every enabled gateway at checkout ({connected} active). Cash on delivery is set under{" "}
            <Link href="/dashboard/settings/shipping" className="text-accent hover:underline">
              Shipping &amp; COD
            </Link>
            .
          </>
        }
      />
      {summaries.map((s) => (
        <IntegrationCard
          key={s.provider}
          data={toCardData(s)}
          canManage={manage}
          extra={
            host && WEBHOOK_HELP[s.provider] ? (
              <div className="rounded-md bg-surface-secondary p-3 text-small">
                <p className="font-medium">Webhook URL</p>
                <p className="mt-1 break-all font-mono text-caption">{`${storeOrigin(host)}/api/webhooks/${s.provider}`}</p>
                <p className="mt-1 text-caption text-muted">{WEBHOOK_HELP[s.provider]}</p>
              </div>
            ) : null
          }
        />
      ))}
      <p className="text-caption text-muted">Payment success is always confirmed with the gateway&apos;s server API before an order is marked paid; the browser redirect alone never marks an order paid.</p>
    </div>
  );
}
