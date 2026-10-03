"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapDbError } from "@/lib/supabase/errors";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { storeOrigin } from "@/lib/platform/urls";
import { requireStoreTenant } from "@/features/cart/context";
import { mergeGuestCartIntoCustomer } from "@/features/cart/service";
import { clearCartCookie } from "@/features/cart/token";
import { emit } from "@/features/notifications/events";
import { trackCommerceEvent } from "@/features/checkout/analytics";
import { ensureStoreCustomer, getStoreCustomer } from "./session";
import { flagClientEvent } from "@/features/tracking/server/flag";
import {
  cancelOrderSchema,
  forgotPasswordSchema,
  idSchema,
  otpRequestSchema,
  otpVerifySchema,
  profileSchema,
  resetPasswordSchema,
  RETURN_REASONS,
  returnRequestSchema,
  savedAddressSchema,
  signInSchema,
  signUpSchema,
  wishlistSchema,
} from "./schemas";

// ---------------------------------------------------------------------------------------------
// Wishlist (also used by the storefront product cards / PDP)

/** Toggles a product in the signed-in shopper's wishlist (RLS: wishlist_self). */
export async function toggleWishlistAction(_prev: ActionResult<{ saved: boolean }> | null, fd: FormData): Promise<ActionResult<{ saved: boolean }>> {
  const result = await runAction("wishlist.toggle", async () => {
    const input = parseInput(wishlistSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    const customer = (await getStoreCustomer(tenant.tenantId)) ?? (await ensureStoreCustomer(tenant.tenantId));
    if (!customer) throw new AppError("UNAUTHENTICATED", { message: "Sign in to save items to your wishlist." });
    await rateLimit("wishlist", customer.id, 60, 60);
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("wishlist_items")
      .select("product_id")
      .eq("tenant_id", tenant.tenantId)
      .eq("customer_id", customer.id)
      .eq("product_id", input.productId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("wishlist_items").delete().eq("tenant_id", tenant.tenantId).eq("customer_id", customer.id).eq("product_id", input.productId);
      if (error) throw mapDbError(error);
      return { saved: false };
    }
    // The composite FK (tenant_id, product_id) rejects another store's product.
    const { error } = await supabase.from("wishlist_items").insert({ tenant_id: tenant.tenantId, customer_id: customer.id, product_id: input.productId });
    if (error) throw mapDbError(error);
    return { saved: true };
  });
  if (result.ok) refresh();
  return result;
}

// ---------------------------------------------------------------------------------------------
// Auth on the store host (cookies are per host; ADR-016)

async function afterSignIn(tenantId: string): Promise<boolean> {
  const customer = await ensureStoreCustomer(tenantId);
  if (customer) await mergeGuestCartIntoCustomer(tenantId, customer.id);
  return Boolean(customer);
}

function callbackUrl(host: string, next: string): string {
  return `${storeOrigin(host)}/account/auth/callback?next=${encodeURIComponent(safeRedirectPath(next, "/account"))}`;
}

export async function storeSignInAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let next = "/account";
  const result = await runAction("store.signIn", async () => {
    const input = parseInput(signInSchema, formToObject(fd));
    next = safeRedirectPath(input.next, "/account");
    const tenant = await requireStoreTenant();
    await rateLimit("store-login:ip", await clientIpKey(), 20, 600);
    await rateLimit("store-login:email", input.email, 8, 600);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw new AppError("UNAUTHENTICATED", { fieldErrors: { _form: ["Email or password is incorrect."] } });
    await afterSignIn(tenant.tenantId);
    await flagClientEvent("login", "password");
  });
  if (result.ok) redirect(next);
  return result;
}

export async function storeSignUpAction(_prev: ActionResult<{ needsConfirmation: boolean }> | null, fd: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  let next = "/account";
  let signedIn = false;
  const result = await runAction("store.signUp", async () => {
    const input = parseInput(signUpSchema, formToObject(fd));
    next = safeRedirectPath(input.next, "/account");
    const tenant = await requireStoreTenant();
    await rateLimit("store-signup:ip", await clientIpKey(), 10, 3600);
    const supabase = await createSupabaseServerClient();
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(" ");
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: displayName }, emailRedirectTo: callbackUrl(tenant.host, next) },
    });
    if (error) throw new AppError("VALIDATION", { fieldErrors: { _form: ["We couldn't create your account. If you've shopped with us before, try signing in instead."] } });
    if (data.session) {
      signedIn = true;
      await flagClientEvent("sign_up", "email");
      const linked = await afterSignIn(tenant.tenantId);
      if (linked && input.acceptsMarketing) {
        const customer = await getStoreCustomer(tenant.tenantId);
        if (customer) await supabase.from("customers").update({ accepts_marketing: true, marketing_consent_at: new Date().toISOString() }).eq("id", customer.id);
      }
    }
    return { needsConfirmation: !data.session };
  });
  if (result.ok && signedIn) redirect(next);
  return result;
}

/** Emails a password reset link that lands back on THIS store (never reveals whether the email exists). */
export async function storeForgotPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("store.forgotPassword", async () => {
    const input = parseInput(forgotPasswordSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    await rateLimit("store-reset:ip", await clientIpKey(), 5, 3600);
    await rateLimit("store-reset:email", input.email, 3, 3600);
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: callbackUrl(tenant.host, "/account/reset-password") });
  });
}

/** Sets a new password for the shopper signed in via the recovery link. */
export async function storeResetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("store.resetPassword", async () => {
    const input = parseInput(resetPasswordSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw new AppError("UNAUTHENTICATED", { fieldErrors: { _form: ["Your reset link has expired. Please request a new one."] } });
    await afterSignIn(tenant.tenantId);
  });
  if (result.ok) redirect("/account");
  return result;
}

export async function requestOtpAction(_prev: ActionResult<{ email: string }> | null, fd: FormData): Promise<ActionResult<{ email: string }>> {
  return runAction("store.otpRequest", async () => {
    const input = parseInput(otpRequestSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    await rateLimit("store-otp:ip", await clientIpKey(), 10, 3600);
    await rateLimit("store-otp:email", input.email, 5, 3600);
    const supabase = await createSupabaseServerClient();
    // Report success either way (no account enumeration); Supabase emails a code + magic link.
    await supabase.auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(tenant.host, input.next ?? "/account") } });
    return { email: input.email };
  });
}

export async function verifyOtpAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let next = "/account";
  const result = await runAction("store.otpVerify", async () => {
    const input = parseInput(otpVerifySchema, formToObject(fd));
    next = safeRedirectPath(input.next, "/account");
    const tenant = await requireStoreTenant();
    await rateLimit("store-otp-verify:email", input.email, 10, 600);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ email: input.email, token: input.token, type: "email" });
    if (error) throw new AppError("UNAUTHENTICATED", { fieldErrors: { token: ["That code is invalid or has expired."] } });
    await afterSignIn(tenant.tenantId);
    await flagClientEvent("login", "otp");
  });
  if (result.ok) redirect(next);
  return result;
}

export async function storeSignOutAction(): Promise<void> {
  await requireStoreTenant();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // The cart may belong to the customer who just left this device.
  await clearCartCookie();
  redirect("/");
}

// ---------------------------------------------------------------------------------------------
// Profile & addresses (user-scoped client: RLS customers_self_update / addresses_self)

async function requireCustomerForAction() {
  const tenant = await requireStoreTenant();
  const customer = (await getStoreCustomer(tenant.tenantId)) ?? (await ensureStoreCustomer(tenant.tenantId));
  if (!customer) throw new AppError("UNAUTHENTICATED");
  return { tenant, customer };
}

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("account.profile", async () => {
    const input = parseInput(profileSchema, formToObject(fd));
    const { tenant, customer } = await requireCustomerForAction();
    const supabase = await createSupabaseServerClient();
    const consentChanged = input.acceptsMarketing !== customer.acceptsMarketing;
    const { error } = await supabase
      .from("customers")
      .update({
        first_name: input.firstName,
        last_name: input.lastName ?? null,
        phone: input.phone ?? customer.phone,
        accepts_marketing: input.acceptsMarketing,
        ...(consentChanged ? { marketing_consent_at: input.acceptsMarketing ? new Date().toISOString() : null } : {}),
      })
      .eq("tenant_id", tenant.tenantId)
      .eq("id", customer.id);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}

export async function saveAddressAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("account.saveAddress", async () => {
    const input = parseInput(savedAddressSchema, formToObject(fd));
    const { tenant, customer } = await requireCustomerForAction();
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("customer_id", customer.id);
    if (!input.id && (count ?? 0) >= 20) throw new AppError("VALIDATION", { fieldErrors: { _form: ["You can save up to 20 addresses."] } });
    const makeDefault = input.isDefault || (count ?? 0) === 0;
    if (makeDefault) {
      await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", customer.id).eq("is_default", true);
    }
    const row = {
      tenant_id: tenant.tenantId,
      customer_id: customer.id,
      label: input.label ?? null,
      name: input.name,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      landmark: input.landmark ?? null,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
      is_default: makeDefault,
    };
    const q = input.id
      ? supabase.from("customer_addresses").update(row).eq("id", input.id).eq("customer_id", customer.id).select("id").single()
      : supabase.from("customer_addresses").insert(row).select("id").single();
    const { data, error } = await q;
    if (error || !data) throw error ? mapDbError(error) : new AppError("NOT_FOUND");
    return { id: data.id };
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteAddressAction(fd: FormData): Promise<void> {
  await runAction("account.deleteAddress", async () => {
    const input = parseInput(idSchema, formToObject(fd));
    const { customer } = await requireCustomerForAction();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("customer_addresses").delete().eq("id", input.id).eq("customer_id", customer.id);
    if (error) throw mapDbError(error);
  });
  refresh();
}

export async function setDefaultAddressAction(fd: FormData): Promise<void> {
  await runAction("account.defaultAddress", async () => {
    const input = parseInput(idSchema, formToObject(fd));
    const { customer } = await requireCustomerForAction();
    const supabase = await createSupabaseServerClient();
    const { data: target } = await supabase.from("customer_addresses").select("id").eq("id", input.id).eq("customer_id", customer.id).maybeSingle();
    if (!target) throw new AppError("NOT_FOUND");
    await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", customer.id).eq("is_default", true);
    const { error } = await supabase.from("customer_addresses").update({ is_default: true }).eq("id", input.id).eq("customer_id", customer.id);
    if (error) throw mapDbError(error);
  });
  refresh();
}

// ---------------------------------------------------------------------------------------------
// Orders: cancel (COD, unfulfilled) and returns (delivered)

export async function cancelMyOrderAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("account.cancelOrder", async () => {
    const input = parseInput(cancelOrderSchema, formToObject(fd));
    const { tenant, customer } = await requireCustomerForAction();
    await rateLimit("account:cancel", customer.id, 10, 3600);
    // Ownership proven through RLS (orders_customer_select) AND explicit filters.
    const supabase = await createSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, status, payment_method, payment_status, fulfillment_status")
      .eq("tenant_id", tenant.tenantId)
      .eq("customer_id", customer.id)
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order) throw new AppError("NOT_FOUND");
    if (order.payment_method !== "cod" || order.fulfillment_status !== "unfulfilled" || !["pending", "confirmed"].includes(order.status)) {
      throw new AppError("CONFLICT", { message: "This order can no longer be cancelled online. Please contact the store." });
    }
    const reason = `Cancelled by customer${input.reason ? `: ${input.reason}` : ""}`;
    const { error } = await createSupabaseAdminClient().rpc("svc_cancel_order", { p_order: order.id, p_reason: reason });
    if (error) throw mapDbError(error, { orderId: order.id });
    emit({ type: "order.status_changed", tenantId: tenant.tenantId, orderId: order.id, status: "cancelled", cancelReason: input.reason ?? null });
  });
  if (result.ok) refresh();
  return result;
}

export async function requestReturnAction(_prev: ActionResult<{ returnId: string }> | null, fd: FormData): Promise<ActionResult<{ returnId: string }>> {
  const result = await runAction("account.requestReturn", async () => {
    const raw = formToObject(fd);
    const input = parseInput(returnRequestSchema, raw);
    const { tenant, customer } = await requireCustomerForAction();
    await rateLimit("account:return", customer.id, 10, 3600);
    const supabase = await createSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, fulfillment_status, order_items(id, quantity, returned_quantity)")
      .eq("tenant_id", tenant.tenantId)
      .eq("customer_id", customer.id)
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order) throw new AppError("NOT_FOUND");
    if (order.fulfillment_status !== "delivered") throw new AppError("CONFLICT", { message: "Only delivered orders can be returned." });

    const items: { order_item_id: string; quantity: number; reason: string }[] = [];
    for (const item of order.order_items ?? []) {
      const qty = Number(raw[`qty_${item.id}`] ?? 0);
      if (!Number.isInteger(qty) || qty < 0) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Choose valid quantities."] } });
      if (qty > item.quantity - item.returned_quantity) throw new AppError("VALIDATION", { fieldErrors: { _form: ["You can't return more than you bought."] } });
      if (qty > 0) items.push({ order_item_id: item.id, quantity: qty, reason: RETURN_REASONS[input.reason] });
    }
    if (items.length === 0) throw new AppError("VALIDATION", { fieldErrors: { _form: ["Choose at least one item to return."] } });

    const { data: returnId, error } = await createSupabaseAdminClient().rpc("svc_create_return", {
      p_tenant: tenant.tenantId,
      p_order: order.id,
      p_customer: customer.id,
      p_reason: RETURN_REASONS[input.reason],
      p_note: (input.note ?? null) as string,
      p_items: items,
    });
    if (error || !returnId) throw error ? mapDbError(error, { orderId: order.id }) : new AppError("INTERNAL");
    emit({ type: "return.updated", tenantId: tenant.tenantId, orderId: order.id, returnId: String(returnId), status: "requested" });
    return { returnId };
  });
  if (result.ok) refresh();
  return result;
}

/** Re-creates a cart from an unpaid/expired order so the shopper can try again. */
export async function reorderAction(fd: FormData): Promise<void> {
  const orderId = String(fd.get("orderId") ?? "");
  const result = await runAction("account.reorder", async () => {
    const { orderIdFromToken } = await import("@/features/checkout/order-access");
    const token = String(fd.get("t") ?? "");
    const tenant = await requireStoreTenant();
    const tokenOrder = orderIdFromToken(token);
    const customer = await getStoreCustomer(tenant.tenantId);
    const admin = createSupabaseAdminClient();
    const { data: order } = await admin.from("orders").select("id, customer_id").eq("tenant_id", tenant.tenantId).eq("id", orderId).maybeSingle();
    if (!order || !(tokenOrder === order.id || (customer && order.customer_id === customer.id))) throw new AppError("NOT_FOUND");
    const { data: items } = await admin.from("order_items").select("variant_id, quantity").eq("tenant_id", tenant.tenantId).eq("order_id", order.id);
    const { addItem } = await import("@/features/cart/service");
    for (const i of items ?? []) {
      if (!i.variant_id) continue;
      try {
        await addItem(tenant.tenantId, i.variant_id, i.quantity);
      } catch {
        // skip items that are no longer available
      }
    }
    await trackCommerceEvent(tenant.tenantId, "add_to_cart", { customerId: customer?.id, metadata: { reorder_of: order.id } });
  });
  if (result.ok) redirect("/cart");
  redirect("/cart?notice=reorder");
}

/**
 * "Continue with Google" for shoppers on a store host. Supabase redirects back to THIS store's
 * /account/auth/callback, which exchanges the code and links the customer to the store.
 * Store hosts must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export async function storeGoogleSignInAction(fd: FormData): Promise<void> {
  const next = safeRedirectPath(typeof fd.get("next") === "string" ? (fd.get("next") as string) : "", "/account");
  const tenant = await requireStoreTenant();
  await rateLimit("store-login:ip", await clientIpKey(), 20, 600);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(tenant.host, next), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/account/login?error=google");
  redirect(data.url);
}
