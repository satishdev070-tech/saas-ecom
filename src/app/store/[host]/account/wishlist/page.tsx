import type { Metadata } from "next";
import Link from "next/link";
import { getRenderContext } from "@/features/theme/render/load";
import { requireStoreCustomer } from "@/features/customer-account/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProductCards } from "@/features/storefront/server/catalog";
import { ProductGrid } from "@/features/storefront/components/product-card";
import { AccountNav } from "../account-nav";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function WishlistPage({ params }: PageProps<"/store/[host]/account/wishlist">) {
  const { host } = await params;
  const { sf } = await getRenderContext(host);
  const c = await requireStoreCustomer(sf.tenant.tenantId, "/account/wishlist");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("wishlist_items").select("product_id").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(100);
  const cards = await getProductCards(sf.tenant.tenantId, (data ?? []).map((w) => w.product_id));
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-heading mb-6 text-4xl">Wishlist</h1>
      <AccountNav current="wishlist" />
      {cards.length ? (
        <ProductGrid products={cards} settings={sf.theme.productCard} />
      ) : (
        <p className="sf-muted">
          Nothing saved yet. <Link href="/collections" className="sf-link">Browse collections</Link>
        </p>
      )}
    </div>
  );
}
