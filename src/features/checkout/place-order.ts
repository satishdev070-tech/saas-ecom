import "server-only";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import type { ResolvedTenant } from "@/lib/tenant/context";
import type { Json } from "@/lib/supabase/database.types";
import { loadCartLines } from "@/features/cart/lines";
import { requireCart, updateCart } from "@/features/cart/service";
import { clearCartCookie } from "@/features/cart/token";
import { getStoreCustomer, type StoreCustomer } from "@/features/customer-account/session";
import { toOrderAddress } from "@/features/customer-account/address";
import { getCheckoutOptions } from "./server/options";
import { getPaymentProvider } from "@/features/payments/provider";
import { afterOrderConfirmed } from "./post-order";
import { recordWhatsAppOptIn } from "@/features/notifications/whatsapp/consent";
import { OPT_IN_LABEL_TEXT } from "@/features/notifications/whatsapp/opt-in-text";
import { buildOrderPayload } from "./order-payload";
import { orderPath, paymentPath } from "./order-access";
import { loadPaymentOptions } from "./payment-options";
import { quoteCart } from "./quote";
import { totalsAreConsistent } from "./pricing";
import type { CheckoutInput } from "./schemas";
import { cookies } from "next/headers";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/features/tracking/items";

/** Minutes an unpaid online order holds its stock before the expiry cron releases it. */
export const ONLINE_RESERVATION_MINUTES = 30;

export type PlaceOrderResult = { orderId: string; redirectTo: string };

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function existingOrderForKey(admin: Admin, tenantId: string, key: string) {
  const { data } = await admin.from("orders").select("id, payment_method, payment_status, status").eq("tenant_id", tenantId).eq("idempotency_key", key).maybeSingle();
  return data;
}

function redirectFor(order: { id: string; payment_method: string; payment_status: string; status: string }): string {
  return order.payment_method === "online" && order.payment_status === "pending" && order.status === "pending" ? paymentPath(order.id) : orderPath(order.id);
}

function splitName(name: string): { first: string; last: string | null } {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { first: first.slice(0, 80), last: rest.join(" ").slice(0, 80) || null };
}

/**
 * Guest checkout still records a tenant `customers` row (by email) so the seller sees order
 * history. Registered customers are attached by email too (standard storefront behaviour); a
 * guest can never READ that history, which requires signing in with the verified email.
 */
async function resolveGuestCustomer(admin: Admin, tenantId: string, input: CheckoutInput): Promise<string | null> {
  const { data: found } = await admin.from("customers").select("id, status, accepts_marketing").eq("tenant_id", tenantId).eq("email", input.email).maybeSingle();
  if (found) {
    if (found.status === "blocked") throw new AppError("FORBIDDEN", { message: "We couldn't place this order. Please contact the store.", context: { reason: "customer blocked" } });
    if (input.acceptsMarketing && !found.accepts_marketing) {
      await admin.from("customers").update({ accepts_marketing: true, marketing_consent_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", found.id);
    }
    return found.id;
  }
  const name = splitName(input.name);
  const { data: created, error } = await admin
    .from("customers")
    .insert({
      tenant_id: tenantId,
      email: input.email,
      phone: input.contactPhone,
      first_name: name.first || null,
      last_name: name.last,
      accepts_marketing: input.acceptsMarketing,
      marketing_consent_at: input.acceptsMarketing ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (created) return created.id;
  // Lost a race with a concurrent checkout for the same email: use the winner.
  const { data: again } = await admin.from("customers").select("id").eq("tenant_id", tenantId).eq("email", input.email).maybeSingle();
  if (!again) logger.warn("checkout.guest_customer_failed", { tenantId, error: error?.message });
  return again?.id ?? null;
}

async function updateSignedInCustomer(admin: Admin, tenantId: string, customer: StoreCustomer, input: CheckoutInput): Promise<void> {
  const patch: { phone?: string; first_name?: string; last_name?: string | null; accepts_marketing?: boolean; marketing_consent_at?: string } = {};
  if (!customer.phone) patch.phone = input.contactPhone;
  if (!customer.firstName) {
    const name = splitName(input.name);
    if (name.first) {
      patch.first_name = name.first;
      patch.last_name = name.last;
    }
  }
  if (input.acceptsMarketing && !customer.acceptsMarketing) {
    patch.accepts_marketing = true;
    patch.marketing_consent_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await admin.from("customers").update(patch).eq("tenant_id", tenantId).eq("id", customer.id);
  if (error) logger.warn("checkout.customer_update_failed", { tenantId, error: error.message });
}

/** Saves the shipping address to the signed-in customer's address book (RLS: addresses_self). Best-effort. */
async function saveAddressForCustomer(tenantId: string, customer: StoreCustomer, input: CheckoutInput): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase.from("customer_addresses").select("id, line1, postal_code, is_default").eq("tenant_id", tenantId).eq("customer_id", customer.id);
    if ((existing ?? []).some((a) => a.line1.toLowerCase() === input.line1.toLowerCase() && a.postal_code === input.postalCode)) return;
    if ((existing ?? []).length >= 20) return;
    await supabase.from("customer_addresses").insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      name: input.name,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      landmark: input.landmark ?? null,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
      is_default: (existing ?? []).length === 0,
    });
  } catch (err) {
    logger.warn("checkout.save_address_failed", { tenantId, error: err });
  }
}

/**
 * Places an order for the host-resolved tenant:
 * idempotency short-circuit -> re-price the cart from CURRENT DB data -> validate shipping,
 * payment method and the total the shopper saw -> svc_place_order (locks prices, reserves stock,
 * enforces discount limits) -> COD side effects or online payment initiation.
 * Throws AppError; wrap callers in runAction.
 */
export async function placeOrder(tenant: ResolvedTenant, input: CheckoutInput): Promise<PlaceOrderResult> {
  const admin = createSupabaseAdminClient();
  const tenantId = tenant.tenantId;

  // Double submit / retry with the same key: send the shopper to the order that already exists.
  const prior = await existingOrderForKey(admin, tenantId, input.idempotencyKey);
  if (prior) return { orderId: prior.id, redirectTo: redirectFor(prior) };

  const cart = await requireCart(tenantId);
  const lines = (await loadCartLines(tenantId, cart.id)).filter((l) => !l.savedForLater);
  if (lines.length === 0) throw new AppError("VALIDATION", { message: "Your cart is empty.", fieldErrors: { _form: ["Your cart is empty."] } });

  const customer = await getStoreCustomer(tenantId);
  if (!customer && !(await getCheckoutOptions(tenantId)).guestCheckout) {
    throw new AppError("UNAUTHENTICATED", { message: "Please sign in to check out.", fieldErrors: { _form: ["Please sign in to check out. This store doesn't offer guest checkout."] } });
  }
  const quote = await quoteCart(tenantId, cart, lines, { pincode: input.postalCode, shippingRateId: input.shippingRateId ?? null, paymentMethod: input.paymentMethod });
  const pricing = quote.pricing;

  if (quote.issues.length > 0) {
    throw new AppError("CONFLICT", {
      message: "Some items in your cart are no longer available in the quantity you chose. Please review your cart.",
      context: { hint: "INSUFFICIENT_STOCK", issues: quote.issues.length },
    });
  }
  if (!pricing.shipping.serviceable || !pricing.shipping.selected) {
    throw new AppError("VALIDATION", { fieldErrors: { postalCode: ["Sorry, we don't deliver to this PIN code yet."] } });
  }

  const options = await loadPaymentOptions(tenantId, quote.settings.cod.enabled);
  if (input.paymentMethod === "cod") {
    if (!options.codOffered) throw new AppError("VALIDATION", { fieldErrors: { paymentMethod: ["Cash on Delivery isn't offered by this store."] } });
    if (!pricing.cod.available) throw new AppError("VALIDATION", { fieldErrors: { paymentMethod: [pricing.cod.reason ?? "Cash on Delivery isn't available for this order."] } });
  } else if (!options.online) {
    throw new AppError("VALIDATION", { fieldErrors: { paymentMethod: ["Online payment isn't available right now. Please choose Cash on Delivery."] } });
  }

  if (input.expectedTotal !== undefined && input.expectedTotal !== pricing.grandTotal) {
    throw new AppError("CONFLICT", {
      message: `Your order total changed to ${formatMoney(pricing.grandTotal)}. Please review the summary and place the order again.`,
      context: { hint: "PRICE_CHANGED", expected: input.expectedTotal, actual: pricing.grandTotal },
    });
  }
  if (!totalsAreConsistent(pricing)) throw new AppError("INTERNAL", { context: { reason: "pricing invariant failed" } });

  const customerId = customer ? customer.id : await resolveGuestCustomer(admin, tenantId, input);
  const name = splitName(input.name);
  const payload = buildOrderPayload({
    tenantId,
    idempotencyKey: input.idempotencyKey,
    cartId: cart.id,
    customerId,
    email: input.email,
    phone: input.contactPhone,
    paymentMethod: input.paymentMethod,
    pricing,
    discount: quote.discount,
    shippingAddress: toOrderAddress(input),
    customerSnapshot: {
      customer_id: customerId,
      email: input.email,
      phone: input.contactPhone,
      first_name: customer?.firstName ?? (name.first || null),
      last_name: customer?.lastName ?? name.last,
      accepts_marketing: input.acceptsMarketing || Boolean(customer?.acceptsMarketing),
      signed_in: Boolean(customer),
    },
    note: input.note ?? cart.note ?? null,
    reservationMinutes: ONLINE_RESERVATION_MINUTES,
  });

  const { data: orderId, error } = await admin.rpc("svc_place_order", { p_order: payload.order as Json, p_items: payload.items as Json });
  if (error || !orderId) {
    if (error?.hint === "DISCOUNT_INVALID" && cart.discountCode) {
      // The code hit its usage limit (or expired) since the page loaded: drop it so the next attempt works.
      await updateCart(tenantId, { discount_code: null });
      throw new AppError("CONFLICT", { message: "That discount code can no longer be used, so we've removed it. Please review your total.", context: { hint: "DISCOUNT_INVALID" } });
    }
    throw error ? mapDbError(error, { tenantId, cartId: cart.id }) : new AppError("INTERNAL");
  }

  // First-touch campaign attribution (validated; campaign parameters only). Never blocks the order.
  const attribution = parseAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value);
  if (attribution) {
    const { error: attrError } = await admin.from("orders").update({ attribution: attribution as Json }).eq("tenant_id", tenantId).eq("id", orderId);
    if (attrError) logger.warn("checkout.attribution_failed", { tenantId, orderId, error: attrError.message });
    if (customer) await admin.from("customers").update({ attribution: attribution as Json }).eq("tenant_id", tenantId).eq("id", customer.id).eq("attribution", "{}");
  }

  if (customer) {
    await updateSignedInCustomer(admin, tenantId, customer, input);
    if (input.saveAddress) await saveAddressForCustomer(tenantId, customer, input);
  }
  await clearCartCookie();

  // WhatsApp order-update consent (only offered when the store has WhatsApp notifications on).
  // Recorded before the confirmation hooks run, so the order-placed message sees it. Never blocks the order.
  if (input.whatsappOptIn) {
    try {
      const { data: store } = await admin.from("stores").select("name").eq("tenant_id", tenantId).maybeSingle();
      await recordWhatsAppOptIn({ tenantId, phone: input.contactPhone, customerId: customer?.id ?? null, orderId, consentText: OPT_IN_LABEL_TEXT(store?.name ?? "this store") });
    } catch (err) {
      logger.warn("checkout.whatsapp_optin_failed", { tenantId, orderId, error: err });
    }
  }

  if (input.paymentMethod === "cod") {
    after(() => afterOrderConfirmed(tenantId, orderId, "cod"));
    return { orderId, redirectTo: `${orderPath(orderId)}&placed=1` };
  }

  // Online: the shopper chooses a gateway on the pay page. Only the dev test provider completes here.
  const { data: order } = await admin.from("orders").select("id, order_number, grand_total, email, phone").eq("tenant_id", tenantId).eq("id", orderId).single();
  if (order && options.online === "manual") {
    try {
      const init = await getPaymentProvider(options.online).initiate({
        id: order.id,
        tenantId,
        orderNumber: order.order_number,
        grandTotalMinor: pricing.grandTotal,
        email: order.email,
        phone: order.phone,
      });
      if (init.kind === "paid") return { orderId, redirectTo: `${orderPath(orderId)}&placed=1` };
    } catch (err) {
      logger.warn("checkout.payment_init_failed", { tenantId, orderId, error: err });
    }
  }
  return { orderId, redirectTo: paymentPath(orderId) };
}
