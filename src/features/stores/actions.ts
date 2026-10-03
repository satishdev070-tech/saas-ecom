"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { requireTenant, assertPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { audit } from "@/lib/audit";

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
