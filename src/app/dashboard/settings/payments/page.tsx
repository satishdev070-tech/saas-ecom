import type { Metadata } from "next";
import Link from "next/link";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { storeOrigin } from "@/lib/platform/urls";
import { PageHeader } from "@/components/ui/layout";
import { listIntegrationSummaries, storeHosts, toCardData } from "@/features/integrations/server/store";
import { onlinePaymentProviders, type OnlineProviderId } from "@/features/payments/credentials";
import { IntegrationCard } from "@/features/integrations/components/integration-card";
import type { ProviderId } from "@/features/integrations/registry";

export const metadata: Metadata = { title: "Payments" };

const WEBHOOK_HELP: Partial<Record<ProviderId, string>> = {
  razorpay: "Razorpay Dashboard → Account & Settings → Webhooks. Events: payment.captured, payment.failed, refund.processed. Use the same webhook secret as above. Live keys only work once Razorpay has approved your store's website.",
  cashfree: "Cashfree Dashboard → Developers → Webhooks (Payment Gateway). Also sent automatically as notify_url on every order. Signed with your Secret Key. For Live mode, also whitelist your store domain in Cashfree → Developers → Whitelisting, or Cashfree refuses to start payments.",
  payu: "PayU Dashboard → Developers → Webhooks, event “Successful payment” and “Failed payment”. Hash-verified with your Salt.",
};

const PROVIDER_NAMES: Partial<Record<ProviderId, string>> = { razorpay: "Razorpay", cashfree: "Cashfree", payu: "PayU" };

export default async function PaymentsPage() {
  const ctx = await requireTenantPermission("payments.manage");
  const [summaries, hosts, liveAtCheckout] = await Promise.all([
    listIntegrationSummaries(ctx.tenantId, "payment"),
    storeHosts(ctx.tenantId),
    // Exactly what checkout uses, so this page can't disagree with the storefront.
    onlinePaymentProviders(ctx.tenantId).catch((): OnlineProviderId[] => []),
  ]);
  const host = hosts[0] ?? null;
  const manage = can(ctx, "payments.manage");
  const live = liveAtCheckout.filter((p): p is "razorpay" | "cashfree" | "payu" => p !== "manual");
  const connected = live.length;
  const otherStores = ctx.memberships.filter((m) => m.tenantId !== ctx.tenantId);
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
      <div role="status" className={`rounded-md border p-4 text-small ${connected ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
        {connected ? (
          <p>
            <span className="font-medium">Online payment is live at checkout</span> of <span className="font-medium">{ctx.tenantName}</span> via {live.map((p) => PROVIDER_NAMES[p] ?? p).join(", ")}.{" "}
            <Link href="/dashboard/payments" className="text-accent hover:underline">
              View transactions
            </Link>
          </p>
        ) : (
          <>
            <p className="font-medium">Online payment is not live at checkout yet.</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
              <li>Save your gateway keys below (test or live).</li>
              <li>Click <span className="font-medium">Test connection</span> — it must succeed.</li>
              <li>Switch the gateway <span className="font-medium">on</span> (done for you the first time the test passes).</li>
            </ol>
          </>
        )}
        {summaries.some((s) => s.enabled && !s.featureEnabled) ? <p className="mt-2 text-warning">A gateway is switched on but not included in your plan, so shoppers can&apos;t see it. Contact support to upgrade.</p> : null}
        <p className="mt-2 text-muted">
          {hosts.length ? (
            <>
              This applies to checkout on{" "}
              {hosts.map((h, i) => (
                <span key={h}>
                  {i ? ", " : ""}
                  <a href={`${storeOrigin(h)}/checkout`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">
                    {h}
                  </a>
                </span>
              ))}{" "}
              only.
            </>
          ) : (
            "This store has no verified web address yet, so shoppers can't reach its checkout."
          )}
        </p>
        {otherStores.length ? (
          <p className="mt-2 text-warning">
            Gateway keys are saved per store. You also manage {otherStores.map((m) => m.tenantName).join(", ")}. If your website shows only Cash on delivery, that website probably belongs to another store: switch stores from the account menu (top right) and connect the gateway there too.
          </p>
        ) : null}
      </div>
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
