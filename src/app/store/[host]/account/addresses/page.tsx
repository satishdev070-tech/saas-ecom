import type { Metadata } from "next";
import { getRenderContext } from "@/features/theme/render/load";
import { requireStoreCustomer } from "@/features/customer-account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAddressAction, setDefaultAddressAction } from "@/features/customer-account/actions";
import { AddressForm } from "@/features/customer-account/components/forms";
import { AccountNav } from "../account-nav";
import { getCheckoutOptions } from "@/features/checkout/server/options";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default async function AccountAddresses({ params }: PageProps<"/store/[host]/account/addresses">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const c = await requireStoreCustomer(sf.tenant.tenantId, "/account/addresses");
  const { locationAutofill } = await getCheckoutOptions(sf.tenant.tenantId);
  const supabase = await createSupabaseServerClient();
  const { data: addresses } = await supabase
    .from("customer_addresses")
    .select("id, label, name, phone, line1, line2, landmark, city, state, postal_code, is_default")
    .eq("customer_id", c.id)
    .order("is_default", { ascending: false })
    .order("created_at");
  return (
    <div className="sf-container sf-section mx-auto max-w-3xl">
      <h1 className="sf-heading mb-6 text-4xl">Addresses</h1>
      <AccountNav current="addresses" />
      <ul className="mb-10 grid gap-4 @[48rem]:grid-cols-2">
        {(addresses ?? []).map((a) => (
          <li key={a.id} className="sf-border space-y-2 rounded border p-4 text-sm">
            <p className="font-medium">
              {a.label || a.name} {a.is_default ? <span className="sf-badge ml-1">Default</span> : null}
            </p>
            <address className="sf-muted not-italic">
              {a.name}, {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.postal_code} · {a.phone}
            </address>
            <div className="flex gap-4 text-xs">
              <details>
                <summary className="sf-link cursor-pointer">Edit</summary>
                <div className="pt-3">
                  <AddressForm value={{ id: a.id, label: a.label, name: a.name, phone: a.phone.replace(/^\+91/, ""), line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postalCode: a.postal_code, isDefault: a.is_default }} locationAutofill={locationAutofill} />
                </div>
              </details>
              {!a.is_default ? (
                <form action={setDefaultAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="sf-link">
                    Make default
                  </button>
                </form>
              ) : null}
              <form action={deleteAddressAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="sf-link">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="sf-heading mb-4 text-2xl">Add an address</h2>
      <AddressForm locationAutofill={locationAutofill} />
    </div>
  );
}
