import type { Metadata } from "next";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/layout";
import { readTaxSettings } from "@/features/settings/tax";
import { TaxForm } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Taxes" };

export default async function TaxesPage() {
  const ctx = await requireTenantPermission("settings.write");
  const { data } = await (await createSupabaseServerClient()).from("stores").select("tax_settings").eq("tenant_id", ctx.tenantId).single();
  const t = readTaxSettings(data?.tax_settings);
  const tiered = t.rules.find((r) => r.max_unit_price != null);
  const top = t.rules.find((r) => r.max_unit_price == null) ?? t.rules[t.rules.length - 1];
  return (
    <div className="space-y-6">
      <PageHeader title="Taxes" description="GST on apparel depends on the per-item price. Check current GST rates with your accountant; the defaults are a starting point." />
      <Card title="GST">
        <TaxForm v={{ pricesIncludeTax: t.prices_include_tax, threshold: tiered?.max_unit_price ? String(tiered.max_unit_price) : "0", lower: String(tiered?.rate ?? top?.rate ?? 5), upper: String(top?.rate ?? 18) }} />
      </Card>
      <p className="text-xs text-muted">HSN codes are set per product and printed on invoices. Add your GSTIN under Store details.</p>
    </div>
  );
}
