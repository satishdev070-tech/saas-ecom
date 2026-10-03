"use server";

import type { AnalyticsItem } from "@/features/tracking/items";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { getStoreCustomer } from "@/features/customer-account/session";
import { trackCommerceEvent } from "@/features/checkout/analytics";
import { discountCode, findDiscountByCode } from "@/features/checkout/discounts";
import { quoteCart } from "@/features/checkout/quote";
import { requireStoreTenant } from "./context";
import { addItem, countCartUnits, removeItem, requireCart, resolveCart, setSavedForLater, updateCart, updateItemQuantity } from "./service";
import { loadCartLines } from "./lines";
import { addToCartSchema, couponSchema, itemSchema, noteSchema, pincodeSchema, saveForLaterSchema, updateItemSchema } from "./schemas";

/**
 * Add to cart / Buy now (used by the product page, owned by the storefront agent).
 * Tenant = verified host; the variant must belong to it and be purchasable.
 */
export type AddToCartResult = { count: number; item: AnalyticsItem };

export async function addToCartAction(_prev: ActionResult<AddToCartResult> | null, fd: FormData): Promise<ActionResult<AddToCartResult>> {
  let buyNow = false;
  const result = await runAction("cart.add", async () => {
    const input = parseInput(addToCartSchema, formToObject(fd));
    buyNow = input.buyNow === "1" || input.buyNow === "true";
    await rateLimit("cart:add", await clientIpKey(), 60, 60);
    const tenant = await requireStoreTenant();
    const added = await addItem(tenant.tenantId, input.variantId, input.quantity);
    const count = await countCartUnits(tenant.tenantId, added.cartId);
    const customer = await getStoreCustomer(tenant.tenantId);
    after(() =>
      trackCommerceEvent(tenant.tenantId, "add_to_cart", {
        cartId: added.cartId,
        customerId: customer?.id,
        metadata: { variant_id: input.variantId, quantity: input.quantity, buy_now: buyNow },
      }),
    );
    if (added.limited && !buyNow) {
      throw new AppError("CONFLICT", { message: `Only ${added.quantity} available — your cart has been updated.` });
    }
    const item: AnalyticsItem = {
      item_id: added.item.sku || added.item.productId,
      item_name: added.item.productTitle,
      ...(added.item.variantTitle ? { item_variant: added.item.variantTitle } : {}),
      price: added.item.unitPrice / 100,
      quantity: input.quantity,
    };
    return { count, item };
  });
  if (result.ok && buyNow) redirect("/checkout");
  if (!result.ok && buyNow && result.error.code === "CONFLICT") redirect("/cart");
  if (result.ok) refresh();
  return result;
}

export async function updateCartItemAction(_prev: ActionResult<{ quantity: number }> | null, fd: FormData): Promise<ActionResult<{ quantity: number }>> {
  const result = await runAction("cart.updateQuantity", async () => {
    const input = parseInput(updateItemSchema, formToObject(fd));
    await rateLimit("cart:write", await clientIpKey(), 120, 60);
    const tenant = await requireStoreTenant();
    const r = await updateItemQuantity(tenant.tenantId, input.itemId, input.quantity);
    if (r.limited) throw new AppError("CONFLICT", { message: `Only ${r.quantity} available. We've updated the quantity.` });
    return { quantity: r.quantity };
  });
  refresh();
  return result;
}

export async function removeCartItemAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("cart.remove", async () => {
    const input = parseInput(itemSchema, formToObject(fd));
    await rateLimit("cart:write", await clientIpKey(), 120, 60);
    const tenant = await requireStoreTenant();
    await removeItem(tenant.tenantId, input.itemId);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveForLaterAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("cart.saveForLater", async () => {
    const input = parseInput(saveForLaterSchema, formToObject(fd));
    await rateLimit("cart:write", await clientIpKey(), 120, 60);
    const tenant = await requireStoreTenant();
    await setSavedForLater(tenant.tenantId, input.itemId, input.saved === "1");
  });
  if (result.ok) refresh();
  return result;
}

export async function applyDiscountAction(_prev: ActionResult<{ code: string }> | null, fd: FormData): Promise<ActionResult<{ code: string }>> {
  const result = await runAction("cart.applyDiscount", async () => {
    const input = parseInput(couponSchema, formToObject(fd));
    const parsed = discountCode.safeParse(input.code);
    if (!parsed.success) throw new AppError("VALIDATION", { fieldErrors: { code: ["That code isn't valid."] } });
    // Codes are guessable: throttle per IP.
    await rateLimit("cart:coupon", await clientIpKey(), 15, 600);
    const tenant = await requireStoreTenant();
    const cart = await requireCart(tenant.tenantId);
    const discount = await findDiscountByCode(tenant.tenantId, parsed.data);
    if (!discount) throw new AppError("VALIDATION", { fieldErrors: { code: ["That code is invalid or has expired."] } });
    const updated = await updateCart(tenant.tenantId, { discount_code: parsed.data });
    const quote = await quoteCart(tenant.tenantId, updated, await loadCartLines(tenant.tenantId, cart.id));
    if (quote.pricing.discount.status === "rejected") {
      // Keep the code on the cart (it may become eligible) but tell the shopper why it's not applied yet.
      throw new AppError("VALIDATION", { fieldErrors: { code: [quote.pricing.discount.message] } });
    }
    return { code: parsed.data };
  });
  refresh();
  return result;
}

export async function removeDiscountAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const result = await runAction("cart.removeDiscount", async () => {
    const tenant = await requireStoreTenant();
    await requireCart(tenant.tenantId);
    await updateCart(tenant.tenantId, { discount_code: null });
  });
  if (result.ok) refresh();
  return result;
}

export async function updateCartNoteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("cart.note", async () => {
    const input = parseInput(noteSchema, formToObject(fd));
    await rateLimit("cart:write", await clientIpKey(), 120, 60);
    const tenant = await requireStoreTenant();
    await requireCart(tenant.tenantId);
    await updateCart(tenant.tenantId, { note: input.note ?? null });
  });
  if (result.ok) refresh();
  return result;
}

export type ShippingEstimate = {
  pincode: string;
  serviceable: boolean;
  codAvailable: boolean;
  rates: { id: string; name: string; price: number; originalPrice: number; daysMin: number; daysMax: number }[];
};

/** Shipping estimate for the current cart at a PIN code (read-only; no cookie write). */
export async function estimateShippingAction(_prev: ActionResult<ShippingEstimate> | null, fd: FormData): Promise<ActionResult<ShippingEstimate>> {
  return runAction("cart.estimateShipping", async () => {
    const input = parseInput(pincodeSchema, formToObject(fd));
    await rateLimit("cart:pincode", await clientIpKey(), 30, 60);
    const tenant = await requireStoreTenant();
    const cart = await resolveCart(tenant.tenantId);
    const lines = cart ? await loadCartLines(tenant.tenantId, cart.id) : [];
    const quote = await quoteCart(tenant.tenantId, cart, lines.filter((l) => !l.savedForLater), { pincode: input.pincode });
    const s = quote.pricing.shipping;
    return {
      pincode: input.pincode,
      serviceable: s.serviceable,
      codAvailable: quote.pricing.cod.available,
      rates: s.rates.map((r) => ({ id: r.id, name: r.name, price: r.price, originalPrice: r.originalPrice, daysMin: r.estimatedDaysMin, daysMax: r.estimatedDaysMax })),
    };
  });
}
