"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";
import { discountDbValue, discountFormSchema } from "./discount-form";

export async function saveDiscountAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  let created: string | null = null;
  const result = await runAction("marketing.saveDiscount", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "marketing.write");
    const raw = formToObject(fd);
    const id = typeof raw.id === "string" && /^[0-9a-f-]{36}$/.test(raw.id) ? raw.id : null;
    const v = parseInput(discountFormSchema(), raw);
    const payload = {
      code: v.code,
      title: v.title,
      type: v.type,
      value: discountDbValue(v),
      applies_to: v.appliesTo,
      min_subtotal: v.minSubtotalMinor / 100,
      max_discount: v.maxDiscountMinor === null ? null : v.maxDiscountMinor / 100,
      config: v.config,
      automatic: v.automatic,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      usage_limit: v.usageLimit,
      per_customer_limit: v.perCustomerLimit,
      status: v.status,
    };
    const { data, error } = await (await createSupabaseServerClient()).rpc("save_discount", {
      p_tenant: ctx.tenantId,
      p_id: id as unknown as string,
      p_discount: payload,
      p_product_ids: v.productIds,
      p_collection_ids: v.collectionIds,
    });
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: id ? "discount.updated" : "discount.created", entityType: "discount", entityId: data, metadata: { code: v.code, type: v.type, status: v.status } });
    if (!id) created = data;
    return { id: data };
  });
  if (created) redirect(`/dashboard/discounts/${created}?created=1`);
  if (result.ok) refresh();
  return result;
}

export async function toggleDiscountAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("marketing.toggleDiscount", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "marketing.write");
    const v = parseInput(z.object({ id: z.uuid(), status: z.enum(["active", "disabled"]) }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("discounts").update({ status: v.status }).eq("id", v.id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "discount.status_changed", entityType: "discount", entityId: v.id, metadata: { status: v.status } });
  });
  if (result.ok) refresh();
  return result;
}
