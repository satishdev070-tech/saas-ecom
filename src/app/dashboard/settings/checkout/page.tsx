import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/layout";
import { CheckoutOptionsForm } from "@/features/dashboard-ui/forms";
import { parseCheckoutOptions } from "@/features/checkout/options";
import { getPublicPlatformConfig } from "@/features/platform/server/public-config";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutSettingsPage() {
  const ctx = await requireTenantPermission("store.read");
  const [{ data: store, error }, platform] = await Promise.all([
    (await createSupabaseServerClient()).from("stores").select("checkout_settings").eq("tenant_id", ctx.tenantId).maybeSingle(),
    getPublicPlatformConfig(),
  ]);
  // A missing column (migration 2500 not applied yet) reads as the defaults.
  const options = parseCheckoutOptions(error ? null : store?.checkout_settings);
  return (
    <div className="space-y-6">
      <PageHeader title="Checkout" description="How shoppers check out on your store. Payments and COD are set under Payments and Shipping & COD." />
      <Card title="Checkout options">
        {can(ctx, "settings.write") ? (
          <CheckoutOptionsForm v={options} locationAvailable={platform.locationAutofill} />
        ) : (
          <ul className="space-y-1 text-small">
            <li>Guest checkout: {options.guestCheckout ? "allowed" : "sign-in required"}</li>
            <li>Location autofill: {options.locationAutofill && platform.locationAutofill ? "on" : "off"}</li>
          </ul>
        )}
      </Card>
      <Card title="Faster sign-in for customers" description="When the platform has Google sign-in enabled, shoppers see “Continue with Google” on your sign-in page and at checkout. One-time email codes (OTP) are always available.">
        <p className="text-small text-muted">Nothing to set up on your side.</p>
      </Card>
    </div>
  );
}
