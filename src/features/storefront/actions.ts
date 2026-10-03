"use server";

import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput, email, uuid } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";
import { requireStoreTenant } from "@/features/cart/context";
import { getStoreCustomer } from "@/features/customer-account/session";

const reviewSchema = z.object({
  productId: uuid,
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(3000).optional(),
});

/**
 * Shopper review. Requires a signed-in store customer; saved as `pending` for moderation.
 * Marked verified when the customer has a non-cancelled order containing the product.
 * Written with the secret-key client (customers have no insert policy) scoped to the
 * server-resolved tenant and customer.
 */
export async function submitReviewAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("storefront.review", async () => {
    const input = parseInput(reviewSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    const customer = await getStoreCustomer(tenant.tenantId);
    if (!customer) throw new AppError("UNAUTHENTICATED");
    await rateLimit("review:customer", customer.id, 5, 3600);
    const admin = createSupabaseAdminClient();
    const { data: product } = await admin.from("products").select("id").eq("id", input.productId).eq("tenant_id", tenant.tenantId).eq("status", "active").maybeSingle();
    if (!product) throw new AppError("NOT_FOUND");
    const { data: purchase } = await admin
      .from("order_items")
      .select("order_id, orders!inner(customer_id, status)")
      .eq("tenant_id", tenant.tenantId)
      .eq("product_id", input.productId)
      .eq("orders.customer_id", customer.id)
      .neq("orders.status", "cancelled")
      .limit(1);
    const author = [customer.firstName, customer.lastName?.slice(0, 1)].filter(Boolean).join(" ") || "Customer";
    const { error } = await admin.from("reviews").insert({
      tenant_id: tenant.tenantId,
      product_id: input.productId,
      customer_id: customer.id,
      order_id: purchase?.[0]?.order_id ?? null,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body ?? null,
      author_name: author.slice(0, 80),
      status: "pending",
      verified_purchase: Boolean(purchase?.length),
    });
    if (error?.code === "23505") throw new AppError("CONFLICT", { message: "You've already reviewed this product.", fieldErrors: { _form: ["You've already reviewed this product."] } });
    if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  });
}

const newsletterSchema = z.object({ email });

/** Newsletter opt-in: upserts a marketing-consented customer record for this store. */
export async function subscribeNewsletterAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("storefront.newsletter", async () => {
    const input = parseInput(newsletterSchema, formToObject(fd));
    const tenant = await requireStoreTenant();
    await rateLimit("newsletter:ip", await clientIpKey(), 10, 3600);
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data: existing } = await admin.from("customers").select("id").eq("tenant_id", tenant.tenantId).eq("email", input.email).maybeSingle();
    const { error } = existing
      ? await admin.from("customers").update({ accepts_marketing: true, marketing_consent_at: now }).eq("id", existing.id)
      : await admin.from("customers").insert({ tenant_id: tenant.tenantId, email: input.email, accepts_marketing: true, marketing_consent_at: now, tags: ["newsletter"] });
    if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  });
}
