import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/layout";
import { assetUrl } from "@/lib/storage/assets";
import { StoreDetailsForm } from "@/features/dashboard-ui/forms";

export const metadata: Metadata = { title: "Store details" };

export default async function StoreSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const { data: s } = await (await createSupabaseServerClient()).from("stores").select("*").eq("tenant_id", ctx.tenantId).single();
  if (!s) throw new Error("Store profile missing");
  const a = (s.address ?? {}) as Record<string, string>;
  const social = (s.social ?? {}) as Record<string, string>;
  const v: Record<string, string> = {
    name: s.name, tagline: s.tagline ?? "", description: s.description ?? "", email: s.email ?? "", phone: s.phone ?? "", whatsapp: s.whatsapp ?? "",
    addressLine1: a.line1 ?? "", addressLine2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "", postalCode: a.postal_code ?? "",
    instagram: social.instagram ?? "", facebook: social.facebook ?? "", youtube: social.youtube ?? "", pinterest: social.pinterest ?? "", x: social.x ?? "",
    gstin: s.gstin ?? "", legalName: s.legal_name ?? "",
    orderPrefix: s.order_prefix, lowStockDefault: String(s.low_stock_default),
  };
  return (
    <div>
      <PageHeader title="Store details" description="Your brand, contact information and invoice details." />
      {can(ctx, "settings.write") ? (
        <StoreDetailsForm v={v} logoUrl={assetUrl(s.logo_path)} faviconUrl={assetUrl(s.favicon_path)} />
      ) : (
        <p className="text-sm text-muted">You can view but not change store settings.</p>
      )}
    </div>
  );
}
