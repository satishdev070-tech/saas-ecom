"use client";

import { useActionState } from "react";
import { track } from "@/features/tracking/client";
import type { AnalyticsItem } from "@/features/tracking/items";
import { applyDiscountAction, removeCartItemAction, removeDiscountAction, saveForLaterAction, updateCartItemAction, updateCartNoteAction } from "@/features/cart/actions";

export function LineQuantity({ itemId, quantity, max, item }: { itemId: string; quantity: number; max: number; item?: AnalyticsItem }) {
  const [state, action, pending] = useActionState(updateCartItemAction, null);
  const limit = Math.max(quantity, Math.min(max, 20));
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor={`qty-${itemId}`} className="sr-only">
        Quantity
      </label>
      <select id={`qty-${itemId}`} name="quantity" defaultValue={quantity} disabled={pending} onChange={(e) => {
          const n = Number(e.currentTarget.value);
          if (item && n !== quantity) track(n < quantity ? "remove_from_cart" : "add_to_cart", { value: item.price * Math.abs(n - quantity), items: [{ ...item, quantity: Math.abs(n - quantity) }] });
          e.currentTarget.form?.requestSubmit();
        }} className="sf-input w-20 py-1">
        {Array.from({ length: limit + 1 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>
            {n === 0 ? "Remove" : n}
          </option>
        ))}
      </select>
      {state && !state.ok ? <span role="alert" className="text-xs text-[var(--sf-sale)]">{state.error.message}</span> : null}
    </form>
  );
}

export function LineButtons({ itemId, saved, item }: { itemId: string; saved: boolean; item?: AnalyticsItem }) {
  const [, removeAction, removing] = useActionState(removeCartItemAction, null);
  const [, saveAction, saving] = useActionState(saveForLaterAction, null);
  return (
    <div className="flex gap-4 text-xs">
      <form action={saveAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="saved" value={saved ? "0" : "1"} />
        <button type="submit" disabled={saving} className="sf-link-quiet underline-offset-2 hover:underline">
          {saved ? "Move to bag" : "Save for later"}
        </button>
      </form>
      <form action={removeAction} onSubmit={() => item && track("remove_from_cart", { value: item.price * item.quantity, items: [item] })}>
        <input type="hidden" name="itemId" value={itemId} />
        <button type="submit" disabled={removing} className="sf-link-quiet underline-offset-2 hover:underline">
          Remove
        </button>
      </form>
    </div>
  );
}

export function CouponForm({ applied, message }: { applied: string | null; message: string | null }) {
  const [state, action, pending] = useActionState(applyDiscountAction, null);
  const [, removeAction, removing] = useActionState(removeDiscountAction, null);
  if (applied) {
    return (
      <form action={removeAction} className="flex items-center justify-between gap-2 text-sm">
        <span>
          Code <strong className="font-mono">{applied}</strong> applied
        </span>
        <button type="submit" disabled={removing} className="sf-link text-xs">
          Remove
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-1">
      <div className="flex gap-2">
        <label htmlFor="coupon" className="sr-only">
          Discount code
        </label>
        <input id="coupon" name="code" placeholder="Discount code" autoCapitalize="characters" className="sf-input min-w-0 flex-1 py-2 uppercase" />
        <button type="submit" disabled={pending} className="sf-btn sf-btn-outline min-h-10 py-2">
          Apply
        </button>
      </div>
      {state && !state.ok ? <p role="alert" className="text-xs text-[var(--sf-sale)]">{state.error.fieldErrors?.code?.[0] ?? state.error.message}</p> : message ? <p className="text-xs">{message}</p> : null}
    </form>
  );
}

export function CartNote({ note }: { note: string | null }) {
  const [state, action, pending] = useActionState(updateCartNoteAction, null);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="cart-note" className="text-sm font-medium">
        Order note
      </label>
      <textarea id="cart-note" name="note" defaultValue={note ?? ""} maxLength={500} rows={2} className="sf-input w-full" placeholder="Gift message or delivery instructions" />
      <button type="submit" disabled={pending} className="sf-link text-xs">
        {state?.ok ? "Saved ✓" : "Save note"}
      </button>
    </form>
  );
}
