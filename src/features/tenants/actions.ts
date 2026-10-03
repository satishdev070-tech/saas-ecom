"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { setActiveTenant } from "@/lib/tenant/active";
import { listMemberships } from "@/lib/tenant/membership";
import { isValidStoreSlug } from "@/lib/tenant/host";
import { publicEnv } from "@/lib/env/public";
import { mapDbError } from "@/lib/supabase/errors";
import { hashToken } from "@/lib/crypto";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";

const createStoreSchema = z.object({
  name: z.string().trim().min(2, "Enter your store name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidStoreSlug, "Use 3-63 lowercase letters, numbers or single hyphens (some names are reserved)"),
});

const setActiveTenantCookie = setActiveTenant;

export async function createStoreAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let tenantId: string | null = null;
  const result = await runAction("tenants.create", async () => {
    const input = parseInput(createStoreSchema, formToObject(fd));
    await requireUser("/onboarding");
    await rateLimit("create-store", await clientIpKey(), 5, 3600);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_tenant", {
      p_name: input.name,
      p_slug: input.slug,
      p_root_domain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN,
    });
    if (error) {
      if (error.code === "23505") throw new AppError("VALIDATION", { fieldErrors: { slug: ["That store address is taken"] } });
      if (error.code === "54000") throw new AppError("VALIDATION", { fieldErrors: { _form: ["You've reached the maximum number of stores for one account"] } });
      throw mapDbError(error);
    }
    tenantId = data;
  });
  if (result.ok && tenantId) {
    await setActiveTenantCookie(tenantId);
    redirect("/dashboard?welcome=1");
  }
  return result;
}

/** Switch the active store. Only stores the user is an active member of are accepted. */
export async function switchTenantAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const tenantId = String(fd.get("tenantId") ?? "");
  const memberships = await listMemberships(user.id);
  if (!memberships.some((m) => m.tenantId === tenantId)) throw new AppError("FORBIDDEN");
  await setActiveTenantCookie(tenantId);
  redirect("/dashboard");
}

export async function acceptInvitationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let tenantId: string | null = null;
  const result = await runAction("tenants.acceptInvitation", async () => {
    const token = String(fd.get("token") ?? "");
    if (token.length < 20 || token.length > 200) throw new AppError("NOT_FOUND");
    await requireUser(`/invite/${encodeURIComponent(token)}`);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("accept_invitation", { p_token_hash: hashToken(token) });
    if (error) throw new AppError("VALIDATION", { fieldErrors: { _form: [error.message.includes("different email") ? "This invitation was sent to a different email address." : "This invitation is invalid or has expired."] } });
    tenantId = data;
  });
  if (result.ok && tenantId) {
    await setActiveTenantCookie(tenantId);
    redirect("/dashboard");
  }
  return result;
}
