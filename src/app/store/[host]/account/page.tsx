import type { Metadata } from "next";
import Link from "next/link";
import { Heart, MapPin, Package } from "lucide-react";
import { getRenderContext } from "@/features/theme/render/load";
import { requireStoreCustomer } from "@/features/customer-account/session";
import { ProfileForm } from "@/features/customer-account/components/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatOrderNumber } from "@/features/checkout/settings";
import { formatMoney, toMinor } from "@/lib/money";
import { AccountNav } from "./account-nav";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const STATUS: Record<string, string> = { unfulfilled: "Being prepared", packed: "Packed", shipped: "On the way", delivered: "Delivered", returned: "Returned", rto: "Returned to us" };

export default async function AccountPage({ params }: PageProps<"/store/[host]/account">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const c = await requireStoreCustomer(sf.tenant.tenantId, "/account");
  // User session: RLS limits every read below to this shopper's own rows.
  const supabase = await createSupabaseServerClient();
  const t = sf.tenant.tenantId;
  const [orders, addresses, wishlist, store] = await Promise.all([
    supabase.from("orders").select("id, order_number, placed_at, status, fulfillment_status, grand_total", { count: "exact" }).eq("tenant_id", t).eq("customer_id", c.id).neq("status", "pending").order("placed_at", { ascending: false }).limit(1),
    supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("customer_id", c.id),
    supabase.from("wishlist_items").select("product_id", { count: "exact", head: true }).eq("tenant_id", t).eq("customer_id", c.id),
    supabase.from("stores").select("order_prefix").eq("tenant_id", t).maybeSingle(),
  ]);
  const last = orders.data?.[0];
  const tiles = [
    { href: "/account/orders", icon: Package, label: "Orders", value: orders.count ?? 0 },
    { href: "/account/addresses", icon: MapPin, label: "Saved addresses", value: addresses.count ?? 0 },
    { href: "/account/wishlist", icon: Heart, label: "Wishlist", value: wishlist.count ?? 0 },
  ];
  return (
    <div className="sf-container sf-section mx-auto max-w-3xl">
      <h1 className="sf-heading mb-6 text-4xl">Hello{c.firstName ? `, ${c.firstName}` : ""}</h1>
      <AccountNav current="profile" />

      <section aria-label="Overview" className="mb-10 space-y-4">
        {last ? (
          <Link href={`/orders/${last.id}`} className="sf-border flex flex-wrap items-center justify-between gap-3 rounded-[var(--sf-radius-card)] border p-5 transition-colors hover:border-[var(--sf-text)]">
            <div>
              <p className="sf-eyebrow">Latest order</p>
              <p className="mt-1 font-medium">
                {formatOrderNumber(store.data?.order_prefix ?? "#", last.order_number)} · {last.status === "cancelled" ? "Cancelled" : (STATUS[last.fulfillment_status] ?? last.fulfillment_status)}
              </p>
              <p className="sf-muted text-sm">{new Date(last.placed_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
            </div>
            <span className="text-sm tabular-nums">{formatMoney(toMinor(last.grand_total))} →</span>
          </Link>
        ) : (
          <div className="sf-border rounded-[var(--sf-radius-card)] border p-5 text-sm">
            <p className="sf-muted">You haven&apos;t placed an order yet.</p>
            <Link href="/collections" className="sf-link mt-1 inline-block">
              Start shopping
            </Link>
          </div>
        )}
        <ul className="grid gap-3 @[40rem]:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.href}>
              <Link href={tile.href} className="sf-border flex items-center gap-3 rounded-[var(--sf-radius-card)] border p-4 transition-colors hover:border-[var(--sf-text)]">
                <tile.icon aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
                <span className="flex-1 text-sm">{tile.label}</span>
                <span className="text-sm font-medium tabular-nums">{tile.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="sf-heading mb-1 text-2xl">Profile</h2>
      <p className="sf-muted mb-6 text-sm">{c.email}</p>
      <ProfileForm initial={{ firstName: c.firstName ?? "", lastName: c.lastName ?? "", phone: (c.phone ?? "").replace(/^\+91/, ""), acceptsMarketing: c.acceptsMarketing }} />
    </div>
  );
}
