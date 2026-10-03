"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { assetUrl } from "@/lib/storage/assets";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import type { Json } from "@/lib/supabase/database.types";
import { getEntitlements } from "@/features/platform";
import { validateValues } from "./engine";
import { listCreativeTemplates, renderAndStore } from "./server";

const schema = z.object({
  template: z.string().regex(/^[a-z0-9-]{2,60}$/),
  name: z.string().trim().min(1, "Give the design a name").max(120),
  imagePath: z.string().max(300).optional().default(""),
});

/** Render the design to PNG, save it in the media library and record the creative. */
export async function saveCreativeAction(_prev: ActionResult<{ path: string; url: string | null }> | null, fd: FormData): Promise<ActionResult<{ path: string; url: string | null }>> {
  const result = await runAction("creative.save", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "marketing.write");
    if (!(await getEntitlements(ctx.tenantId)).isEnabled("creative_studio")) throw new AppError("FORBIDDEN", { message: "Creative Studio isn't available on your plan." });
    const raw = formToObject(fd) as Record<string, unknown>;
    const v = parseInput(schema, raw);
    if (v.imagePath && !v.imagePath.startsWith(`tenant/${ctx.tenantId}/`)) throw new AppError("VALIDATION", { fieldErrors: { imagePath: ["Choose an image from your media library"] } });
    const t = (await listCreativeTemplates()).find((x) => x.key === v.template);
    if (!t) throw new AppError("NOT_FOUND");
    const { values, errors } = validateValues(t, raw);
    if (Object.keys(errors).length) throw new AppError("VALIDATION", { fieldErrors: errors });
    await rateLimit("creative-render", ctx.tenantId, 60, 3600);
    const out = await renderAndStore(ctx.tenantId, t, values, v.imagePath || null, v.name);
    const { data, error } = await (await createSupabaseServerClient())
      .from("creatives")
      .insert({ tenant_id: ctx.tenantId, template_key: t.key, template_version: t.version, name: v.name, values: { ...values, image_path: v.imagePath || null } as Json, output_path: out.path, created_by: ctx.user.id })
      .select("id")
      .single();
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "creative.created", entityType: "creative", entityId: data.id, metadata: { template: t.key, version: t.version } });
    return { path: out.path, url: assetUrl(out.path) };
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteCreativeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("creative.delete", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "marketing.write");
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    // The PNG stays in the media library (it may already be used in posts); only the record goes.
    const { error } = await (await createSupabaseServerClient()).from("creatives").delete().eq("tenant_id", ctx.tenantId).eq("id", id);
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}
