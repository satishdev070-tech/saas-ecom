"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCartAction } from "@/features/cart/actions";
import { toggleWishlistAction } from "@/features/customer-account/actions";
import { track } from "@/features/tracking/client";
import { openCartDrawer } from "./header-islands";
import { HeartIcon } from "./icons";

/** Heart on the product image. Guests are sent to sign in (and come back). */
export function CardWishlist({ productId, title }: { productId: string; title: string }) {
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("productId", productId);
          const r = await toggleWishlistAction(null, fd);
          if (r.ok) {
            setSaved(r.data.saved);
            if (r.data.saved) track("add_to_wishlist", { items: [{ item_id: productId, item_name: title, price: 0, quantity: 1 }] });
          } else if (r.error.code === "UNAUTHENTICATED") {
            router.push(`/account/login?next=${encodeURIComponent(window.location.pathname)}`);
          }
        })
      }
      className="sf-card-heart"
    >
      <HeartIcon size={17} filled={saved} />
    </button>
  );
}

type Size = { value: string; inStock: boolean; variantId: string };

/**
 * Quick add on the card: size buttons (or one "Add to bag" for single-variant products).
 * Desktop: slides up over the image on hover. Touch: a bag button reveals the sizes.
 */
export function CardQuickAdd({ title, sizes, singleVariantId }: { title: string; sizes: Size[]; singleVariantId: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const options = sizes.length ? sizes : singleVariantId ? [{ value: "", inStock: true, variantId: singleVariantId }] : [];
  if (!options.length) return null;

  const add = (variantId: string) =>
    start(async () => {
      setBusy(variantId);
      setError(null);
      const fd = new FormData();
      fd.set("variantId", variantId);
      fd.set("quantity", "1");
      const r = await addToCartAction(null, fd);
      setBusy(null);
      if (r.ok) {
        setOpen(false);
        openCartDrawer();
        track("add_to_cart", { value: r.data.item.price, items: [r.data.item] });
      } else setError(r.error.message);
    });

  return (
    <>
      <button type="button" className="sf-card-bag" aria-label={`Quick add ${title}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 7h12l-1 13H7L6 7Z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
      </button>
      <div className={`sf-card-quick ${open ? "is-open" : ""}`} role="group" aria-label={`Add ${title} to bag`}>
        {options.length === 1 && !options[0]!.value ? (
          <button type="button" className="sf-card-quick-main" disabled={busy !== null} onClick={() => add(options[0]!.variantId)}>
            {busy ? "Adding…" : "Add to bag"}
          </button>
        ) : (
          <>
            <p className="sf-card-quick-label">{error ?? "Quick add · choose size"}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {options.map((o) => (
                <button key={o.value} type="button" disabled={!o.inStock || busy !== null} onClick={() => add(o.variantId)} className="sf-card-quick-size" aria-label={o.inStock ? `Add size ${o.value}` : `Size ${o.value} sold out`}>
                  {busy === o.variantId ? "…" : o.value}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
