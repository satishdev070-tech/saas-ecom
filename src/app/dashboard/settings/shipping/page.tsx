import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney, toMinor } from "@/lib/money";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listPincodeRules, listShippingRates } from "@/features/settings/queries";
import { listIntegrationSummaries, toCardData } from "@/features/integrations/server/store";
import { IntegrationCard } from "@/features/integrations/components/integration-card";
import { DefaultCourierForm } from "@/features/integrations/components/default-courier";
import { CodForm, DeletePincodeRule, DeleteShippingRate, PincodeRuleForm, ShippingRateForm } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Shipping & COD" };

export default async function ShippingPage() {
  const ctx = await requireTenantPermission("store.read");
  const [couriers, rates, rules, { data: store }] = await Promise.all([
    listIntegrationSummaries(ctx.tenantId, "shipping"),
    listShippingRates(ctx.tenantId),
    listPincodeRules(ctx.tenantId),
    (await createSupabaseServerClient()).from("stores").select("cod_settings, integrations").eq("tenant_id", ctx.tenantId).single(),
  ]);
  const cod = (store?.cod_settings ?? {}) as { enabled?: boolean; fee?: number; min_order?: number; max_order?: number | null };
  const w = can(ctx, "settings.write");
  const live = couriers.filter((c) => c.enabled && c.status === "connected").map((c) => c.provider as "shiprocket" | "delhivery");
  const def = (store?.integrations as { default_courier?: string } | null)?.default_courier;
  return (
    <div className="space-y-6">
      <PageHeader title="Shipping & COD" description="Delivery rates, PIN code rules and cash on delivery." />
      <section className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold">Courier partners</h2>
          <p className="text-small text-muted">Connect your own courier accounts to check serviceability, book shipments, print labels, schedule pickups and track parcels from the order page. Without one, you fulfil orders manually.</p>
        </div>
        {couriers.map((c) => (
          <IntegrationCard key={c.provider} data={toCardData(c)} canManage={w} />
        ))}
        {w && live.length > 1 ? <DefaultCourierForm options={live} current={def === "delhivery" ? "delhivery" : "shiprocket"} /> : null}
      </section>
      <Card title="Shipping rates" description="Shoppers see every active rate whose order range and PIN prefixes match.">
        {rates.length === 0 ? <EmptyState title="No shipping rates" description="Without rates, checkout uses a free standard delivery fallback." /> : null}
        <ul className="space-y-3">
          {rates.map((r) => (
            <li key={r.id}>
              <details className="rounded-md border border-border">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted">
                    {toMinor(r.price) === 0 ? "Free" : formatMoney(toMinor(r.price))} · {r.estimated_days_min}–{r.estimated_days_max} days {r.active ? null : <Badge>Inactive</Badge>}
                  </span>
                </summary>
                {w ? (
                  <div className="space-y-3 border-t border-border p-4">
                    <ShippingRateForm value={{ ...r, pincode_prefixes: null } as never} />
                    <DeleteShippingRate id={r.id} />
                  </div>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
        {w ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium">Add a rate</p>
            <ShippingRateForm />
          </div>
        ) : null}
      </Card>
      <Card title="PIN code rules" description="Block delivery or COD for PIN prefixes, or add extra days for remote areas.">
        {rules.length ? (
          <ul className="mb-4 divide-y divide-border text-sm">
            {rules.map((r) => (
              <li key={r.prefix} className="flex items-center justify-between py-2">
                <span className="font-mono">{r.prefix}*</span>
                <span className="text-muted">{r.deliverable ? "Deliverable" : "Not deliverable"} · {r.cod_allowed ? "COD ok" : "No COD"}{r.extra_days ? ` · +${r.extra_days} days` : ""}</span>
                {w ? <DeletePincodeRule prefix={r.prefix} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {w ? <PincodeRuleForm /> : null}
      </Card>
      <Card title="Cash on delivery">
        {w ? (
          <CodForm v={{ enabled: cod.enabled !== false, fee: String(cod.fee ?? 0), minOrder: String(cod.min_order ?? 0), maxOrder: String(cod.max_order ?? 0) }} />
        ) : (
          <p className="text-sm">{cod.enabled ? "Enabled" : "Disabled"}</p>
        )}
      </Card>
    </div>
  );
}
