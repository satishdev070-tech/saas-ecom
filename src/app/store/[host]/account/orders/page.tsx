import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { requireStoreCustomer } from "@/features/customer-account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatOrderNumber } from "@/features/checkout/settings";
import { formatMoney, toMinor } from "@/lib/money";
import { reorderAction } from "@/features/customer-account/actions";
import { AccountNav } from "../account-nav";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default async function AccountOrders({ params }: PageProps<"/store/[host]/account/orders">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const c = await requireStoreCustomer(sf.tenant.tenantId, "/account/orders");
  const supabase = await createSupabaseServerClient();
  const [{ data: orders }, { data: store }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, placed_at, status, fulfillment_status, grand_total, order_items(count)")
      .eq("tenant_id", sf.tenant.tenantId)
      .eq("customer_id", c.id)
      .order("placed_at", { ascending: false })
      .limit(50),
    supabase.from("stores").select("order_prefix").eq("tenant_id", sf.tenant.tenantId).maybeSingle(),
  ]);
  return (
    <div className="sf-container sf-section mx-auto max-w-3xl">
      <h1 className="sf-heading mb-6 text-4xl">Orders</h1>
      <AccountNav current="orders" />
      {orders?.length ? (
        <ul className="sf-border divide-y divide-[var(--sf-border)] border-y">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
              <div>
                <Link href={`/orders/${o.id}`} className="font-medium">
                  {formatOrderNumber(store?.order_prefix ?? "#", o.order_number)}
                </Link>
                <p className="sf-muted">
                  {new Date(o.placed_at).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {o.status === "cancelled" ? "Cancelled" : o.fulfillment_status.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="tabular-nums">{formatMoney(toMinor(o.grand_total))}</span>
                <form action={reorderAction}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button type="submit" className="sf-link text-xs">
                    Buy again
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted">You haven&apos;t placed any orders yet.</p>
      )}
    </div>
  );
}
