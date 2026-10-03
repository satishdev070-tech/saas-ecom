import Link from "next/link";
import { storeSignOutAction } from "@/features/customer-account/actions";

export function AccountNav({ current }: { current: "profile" | "orders" | "addresses" | "wishlist" }) {
  const items = [
    { key: "profile", href: "/account", label: "Overview" },
    { key: "orders", href: "/account/orders", label: "Orders" },
    { key: "addresses", href: "/account/addresses", label: "Addresses" },
    { key: "wishlist", href: "/account/wishlist", label: "Wishlist" },
  ] as const;
  return (
    <nav aria-label="Account" className="sf-border mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-3 text-sm">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={current === i.key ? "page" : undefined} className={current === i.key ? "font-medium underline underline-offset-8" : "sf-muted"}>
          {i.label}
        </Link>
      ))}
      <form action={storeSignOutAction} className="ml-auto">
        <button type="submit" className="sf-link text-sm">
          Sign out
        </button>
      </form>
    </nav>
  );
}
