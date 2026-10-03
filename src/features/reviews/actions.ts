"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { audit } from "@/lib/audit";

export async function moderateReviewAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("reviews.moderate", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "reviews.moderate");
    const v = parseInput(z.object({ id: z.uuid(), op: z.enum(["approved", "rejected", "delete"]) }), formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const { error } = v.op === "delete" ? await supabase.from("reviews").delete().eq("id", v.id).eq("tenant_id", ctx.tenantId) : await supabase.from("reviews").update({ status: v.op }).eq("id", v.id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `review.${v.op === "delete" ? "deleted" : v.op}`, entityType: "review", entityId: v.id });
  });
  if (result.ok) refresh();
  return result;
}

/** Deletes every placeholder review (source = sample) of the store in one step. */
export async function removeSampleReviewsAction(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const result = await runAction("reviews.removeSamples", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "reviews.moderate");
    const { data, error } = await (await createSupabaseServerClient()).from("reviews").delete().eq("tenant_id", ctx.tenantId).eq("source", "sample").select("id");
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "review.samples_removed", entityType: "review", entityId: ctx.tenantId, metadata: { count: data?.length ?? 0 } });
  });
  if (result.ok) refresh();
  return result;
}
