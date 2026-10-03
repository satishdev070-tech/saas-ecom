import type { Metadata } from "next";
import { whatsappOptInAvailable } from "@/features/notifications/whatsapp/consent";
import { redirect } from "next/navigation";
import { getRenderContext } from "@/features/theme/render/load";
import { getCartView } from "@/features/cart/queries";
import { quoteCheckoutAction } from "@/features/checkout/actions";
import { loadPaymentOptions } from "@/features/checkout/payment-options";
import { getStoreCustomer } from "@/features/customer-account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { getCheckoutOptions } from "@/features/checkout/server/options";
import { googleSignInAvailable } from "@/features/auth/google";
import { GoogleButton } from "@/components/auth/google-button";
import { storeGoogleSignInAction } from "@/features/customer-account/actions";
import { TrackEvent } from "@/features/tracking/components/track-event";
import type { AnalyticsItem } from "@/features/tracking/items";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/store/[host]/checkout">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const tenantId = sf.tenant.tenantId;
  const view = await getCartView(tenantId);
  if (!view.lines.length) redirect("/cart");
  const [customer, options] = await Promise.all([getStoreCustomer(tenantId), getCheckoutOptions(tenantId)]);
  if (!customer && !options.guestCheckout) redirect("/account/login?next=/checkout&checkout=1");
  let address: { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string } | null = null;
  if (customer) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("customer_addresses")
      .select("name, phone, line1, line2, landmark, city, state, postal_code")
      .eq("customer_id", customer.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    address = data;
  }
  const [quote, payment] = await Promise.all([
    quoteCheckoutAction({ postalCode: address?.postal_code }),
    loadPaymentOptions(tenantId, sf.store.cod.enabled && sf.features.cod),
  ]);
  if (!quote.ok) redirect("/cart");
  const phone = (customer?.phone ?? address?.phone ?? "").replace(/^\+91/, "");
  const items: AnalyticsItem[] = view.lines.map((l) => ({ item_id: l.sku || l.productId, item_name: l.productTitle, ...(l.variantTitle ? { item_variant: l.variantTitle } : {}), price: l.unitPrice / 100, quantity: l.quantity }));
  return (
    <div className="sf-container sf-section">
      <TrackEvent name="begin_checkout" params={{ value: quote.data.grandTotal / 100, items, ...(quote.data.discount?.code ? { coupon: quote.data.discount.code } : {}) }} />
      <h1 className="sf-heading mb-8 text-4xl">Checkout</h1>
      {!customer && (await googleSignInAvailable("shoppers")) ? (
        <div className="mb-8 flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2">
          <GoogleButton action={storeGoogleSignInAction} next="/checkout" label="Check out faster with Google" className="w-full sm:w-auto" />
          <p className="sf-muted text-sm">{options.guestCheckout ? "Or continue below as a guest." : null}</p>
        </div>
      ) : null}
      <CheckoutForm
        items={items}
        initial={quote.data}
        signedIn={Boolean(customer)}
        locationAutofill={options.locationAutofill}
        whatsappOptInStoreName={(await whatsappOptInAvailable(tenantId)) ? sf.store.name : null}
        codOffered={payment.codOffered}
        onlineOffered={payment.online !== null}
        prefill={{
          email: customer?.email ?? view.cart?.email ?? "",
          phone,
          name: address?.name ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" "),
          line1: address?.line1 ?? "",
          line2: address?.line2 ?? "",
          landmark: address?.landmark ?? "",
          city: address?.city ?? "",
          state: address?.state ?? "",
          postalCode: address?.postal_code ?? "",
          acceptsMarketing: customer?.acceptsMarketing ?? false,
        }}
      />
    </div>
  );
}
