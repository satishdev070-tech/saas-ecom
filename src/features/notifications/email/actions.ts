"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { checkbox, formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { mapDbError } from "@/lib/supabase/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { EMAIL_PREFERENCE_KEYS } from "./preferences";

const flag = z.preprocess(checkbox, z.boolean());
const schema = z.object(Object.fromEntries(EMAIL_PREFERENCE_KEYS.map((k) => [k, flag])) as unknown as Record<(typeof EMAIL_PREFERENCE_KEYS)[number], typeof flag>);

/** Saves which emails the active store sends. Tenant = membership; RLS re-checks settings.write. */
export async function saveEmailPreferencesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("notifications.saveEmailPreferences", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "settings.write");
    const settings = parseInput(schema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("email_preferences").upsert({ tenant_id: ctx.tenantId, settings, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) throw mapDbError(error);
    revalidatePath("/dashboard/settings/notifications");
  });
}
