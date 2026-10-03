"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { requireTenant, assertPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { setActiveTenant } from "@/lib/tenant/active";

/** Publish the active store: draft -> live. Only a draft changes; a live store is left as it is. */
export async function publishStoreAction(): Promise<ActionResult> {
  return runAction("stores.publish", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "settings.write");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("stores")
      .update({ launch_status: "live", launched_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId)
      .eq("launch_status", "draft")
      .select("tenant_id");
    if (error) throw mapDbError(error, { tenantId: ctx.tenantId });
    if (data?.length) {
      revalidateStorefront(ctx.tenantId);
      await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "store.published", entityType: "store", entityId: ctx.tenantId });
    }
    revalidatePath("/dashboard");
  });
}

const closeStoreSchema = z.object({ confirmSlug: z.string().trim().toLowerCase().min(1, "Type the store address to confirm").max(80) });

/**
 * Owner closes the active store (close_own_store: owner only, typed confirmation, no custom
 * domain left). Nothing is deleted; platform support can reopen it. Then goes to another store.
 */
export async function closeStoreAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("stores.close", async () => {
    const { confirmSlug } = parseInput(closeStoreSchema, formToObject(fd));
    const ctx = await requireTenant();
    if (ctx.role !== "owner") throw new AppError("FORBIDDEN", { message: "Only the store owner can close this store." });
    const { error } = await (await createSupabaseServerClient()).rpc("close_own_store", { p_tenant: ctx.tenantId, p_confirm_slug: confirmSlug });
    if (error) {
      if (error.hint === "CONFIRM_MISMATCH") throw new AppError("VALIDATION", { fieldErrors: { confirmSlug: [`Type ${ctx.tenantSlug} exactly to confirm.`] } });
      if (error.hint === "HAS_CUSTOM_DOMAIN") throw new AppError("VALIDATION", { fieldErrors: { _form: ["This store still has a custom domain. Move it to another store or remove it in Settings → Domains first."] } });
      throw mapDbError(error, { tenantId: ctx.tenantId });
    }
    revalidateStorefront(ctx.tenantId);
    const next = ctx.memberships.find((m) => m.tenantId !== ctx.tenantId);
    if (next) await setActiveTenant(next.tenantId);
  });
  if (result.ok) redirect("/dashboard?closed=1");
  return result;
}
