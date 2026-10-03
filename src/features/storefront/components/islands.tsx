"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/features/cart/actions";
import { toggleWishlistAction } from "@/features/customer-account/actions";
import { estimateShippingAction } from "@/features/cart/actions";
import { formatMoney } from "@/lib/money";
import { subscribeNewsletterAction, submitReviewAction } from "@/features/storefront/actions";
import { openCartDrawer } from "./header-islands";
import { HeartIcon } from "./icons";
import { track } from "@/features/tracking/client";

export function QuickAddForm({ variantId, label }: { variantId: string; label: string }) {
  const [state, action, pending] = useActionState(addToCartAction, null);
  useEffect(() => {
    if (!state?.ok) return;
    openCartDrawer();
    track("add_to_cart", { value: state.data.item.price * state.data.item.quantity, items: [state.data.item] });
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value="1" />
      <button type="submit" disabled={pending} aria-label={label} className="sf-btn sf-btn-outline w-full min-h-10 py-2 text-xs">
        {pending ? "Adding…" : state?.ok ? "Added ✓" : "Quick add"}
      </button>
      {state && !state.ok ? <p role="alert" className="mt-1 text-xs text-[var(--sf-sale)]">{state.error.message}</p> : null}
    </form>
  );
}

export function WishlistButton({ productId, initiallySaved = false, compact = false }: { productId: string; initiallySaved?: boolean; compact?: boolean }) {
  const [state, action, pending] = useActionState(toggleWishlistAction, null);
  const saved = state?.ok ? state.data.saved : initiallySaved;
  useEffect(() => {
    if (state?.ok && state.data.saved) track("add_to_wishlist", { items: [{ item_id: productId, item_name: productId, price: 0, quantity: 1 }] });
  }, [state, productId]);
  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" disabled={pending} aria-pressed={saved} className={compact ? "sf-link-quiet text-sm" : "sf-btn sf-btn-outline w-full"}>
        <HeartIcon size={16} filled={saved} className="-mt-0.5 inline" /> {saved ? "Saved to wishlist" : "Add to wishlist"}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="mt-1 text-xs">
          {state.error.code === "UNAUTHENTICATED" ? (
            <>
              <Link href={`/account/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`} className="sf-link">
                Sign in
              </Link>{" "}
              to save items.
            </>
          ) : (
            state.error.message
          )}
        </p>
      ) : null}
    </form>
  );
}

export function PincodeCheck() {
  const [state, action, pending] = useActionState(estimateShippingAction, null);
  return (
    <div className="sf-border rounded-[var(--sf-radius-card)] border p-4">
      <form action={action} className="flex gap-2">
        <label htmlFor="pdp-pincode" className="sr-only">
          Delivery PIN code
        </label>
        <input id="pdp-pincode" name="pincode" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} placeholder="Enter PIN code" required className="sf-input min-w-0 flex-1" />
        <button type="submit" disabled={pending} className="sf-btn sf-btn-outline min-h-10 px-4 py-2 text-sm">
          {pending ? "Checking…" : "Check"}
        </button>
      </form>
      <div aria-live="polite" className="mt-2 text-sm">
        {state?.ok ? (
          state.data.serviceable ? (
            <ul className="space-y-1">
              {state.data.rates.slice(0, 2).map((r) => (
                <li key={r.id}>
                  {r.name}: {r.price === 0 ? "Free" : formatMoney(r.price)} · delivered in {r.daysMin}–{r.daysMax} days
                </li>
              ))}
              <li>{state.data.codAvailable ? "Cash on delivery available" : "Cash on delivery not available for this PIN code"}</li>
            </ul>
          ) : (
            <p>Sorry, we don&apos;t deliver to {state.data.pincode} yet.</p>
          )
        ) : state && !state.ok ? (
          <p role="alert">{state.error.fieldErrors?.pincode?.[0] ?? state.error.message}</p>
        ) : (
          <p className="sf-muted">Check delivery time and cash-on-delivery availability.</p>
        )}
      </div>
    </div>
  );
}

export function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, null);
  if (state?.ok) return <p role="status" className="text-sm">Thanks! Your review will appear once it&apos;s approved.</p>;
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-3">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="flex items-center gap-1 text-sm">
              <input type="radio" name="rating" value={n} defaultChecked={n === 5} /> {n}★
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="rv-title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input id="rv-title" name="title" maxLength={120} className="sf-input w-full" />
      </div>
      <div>
        <label htmlFor="rv-body" className="mb-1 block text-sm font-medium">
          Review
        </label>
        <textarea id="rv-body" name="body" rows={4} maxLength={3000} className="sf-input w-full" />
      </div>
      {err ? (
        <p role="alert" className="text-sm text-[var(--sf-sale)]">
          {err.code === "UNAUTHENTICATED" ? "Please sign in to write a review." : (err.fieldErrors?._form?.[0] ?? err.message)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="sf-btn">
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

export function NewsletterForm({ buttonLabel }: { buttonLabel: string }) {
  const [state, action, pending] = useActionState(subscribeNewsletterAction, null);
  if (state?.ok) return <p role="status">You&apos;re subscribed. Welcome!</p>;
  return (
    <form action={action} className="mx-auto flex max-w-md gap-2">
      <label htmlFor="nl-email" className="sr-only">
        Email address
      </label>
      <input id="nl-email" name="email" type="email" autoComplete="email" required placeholder="Your email" className="sf-input min-w-0 flex-1" />
      <button type="submit" disabled={pending} className="sf-btn">
        {pending ? "…" : buttonLabel}
      </button>
      {state && !state.ok ? <p role="alert" className="sr-only">{state.error.message}</p> : null}
    </form>
  );
}

const RV_KEY = "sf-recently-viewed";

/** Remembers the current product and links to the last few viewed (per browser). */
export function RecentlyViewed({ current }: { current: { slug: string; title: string } }) {
  const [items, setItems] = useState<{ slug: string; title: string }[]>([]);
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem(RV_KEY) ?? "[]") as { slug: string; title: string }[];
      const list = Array.isArray(prev) ? prev.filter((p) => p && typeof p.slug === "string" && p.slug !== current.slug) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      setItems(list.slice(0, 6));
      localStorage.setItem(RV_KEY, JSON.stringify([current, ...list].slice(0, 12)));
    } catch {
      /* storage unavailable */
    }
  }, [current]);
  if (!items.length) return null;
  return (
    <section aria-labelledby="rv-h" className="sf-container sf-section">
      <h2 id="rv-h" className="sf-heading mb-4 text-xl">
        Recently viewed
      </h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((p) => (
          <li key={p.slug}>
            <Link href={`/products/${encodeURIComponent(p.slug)}`} className="sf-badge">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
