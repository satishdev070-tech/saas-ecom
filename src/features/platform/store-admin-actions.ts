"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertPlatformPermission, getPlatformContext, type PlatformContext } from "@/lib/platform/access";
import type { PlatformPermission } from "@/lib/permissions/matrix";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { adminCreateStoreSchema, adminResetLinkSchema, adminSetPasswordSchema, loginAsStoreSchema } from "./schemas";
import { createStoreAsAdmin, endSupportLogin, sendMemberPasswordReset, setMemberPassword, signInAsStoreMember, type ResetLinkResult } from "./server/store-admin";

/**
 * Super-admin store administration actions: validate → authenticate + authorize (platform role)
 * → execute (server/store-admin.ts, audited there) → safe result.
 */

async function platformActor(permission: PlatformPermission): Promise<PlatformContext> {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError("FORBIDDEN");
  assertPlatformPermission(ctx, permission);
  return ctx;
}

export async function adminCreateStoreAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const result = await runAction("platform.store.create", async () => {
    const input = parseInput(adminCreateStoreSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await rateLimit("platform-create-store", ctx.user.id, 30, 3600);
    const { tenantId, notes } = await createStoreAsAdmin(ctx, input);
    const qs = new URLSearchParams({ created: "1" });
    for (const n of notes.slice(0, 5)) qs.append("note", n);
    target = `/admin/tenants/${tenantId}?${qs.toString()}`;
  });
  if (result.ok && target) {
    revalidatePath("/admin/stores");
    redirect(target);
  }
  return result;
}

export async function sendResetLinkAction(_prev: ActionResult<ResetLinkResult> | null, fd: FormData): Promise<ActionResult<ResetLinkResult>> {
  return runAction("platform.member.resetLink", async () => {
    const input = parseInput(adminResetLinkSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await rateLimit("platform-reset-link", ctx.user.id, 20, 3600);
    const r = await sendMemberPasswordReset(ctx, input);
    revalidatePath(`/admin/tenants/${input.tenantId}`);
    return r;
  });
}

export async function setMemberPasswordAction(_prev: ActionResult<{ email: string }> | null, fd: FormData): Promise<ActionResult<{ email: string }>> {
  return runAction("platform.member.setPassword", async () => {
    const input = parseInput(adminSetPasswordSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await rateLimit("platform-set-password", ctx.user.id, 20, 3600);
    const r = await setMemberPassword(ctx, input);
    revalidatePath(`/admin/tenants/${input.tenantId}`);
    return r;
  });
}

export async function loginAsStoreAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let ok = false;
  const result = await runAction("platform.store.loginAs", async () => {
    const input = parseInput(loginAsStoreSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await rateLimit("platform-login-as", ctx.user.id, 20, 3600);
    await signInAsStoreMember(ctx, input);
    revalidateStorefront(input.tenantId);
    ok = true;
  });
  if (result.ok && ok) redirect("/dashboard");
  return result;
}

/** Called from the seller dashboard banner while signed in as a store member. */
export async function endSupportLoginAction(): Promise<void> {
  const marker = await endSupportLogin();
  redirect(marker ? `/admin/login?next=${encodeURIComponent(`/admin/tenants/${marker.tenantId}`)}` : "/admin/login");
}
