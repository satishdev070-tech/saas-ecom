"use server";

import { revalidatePath } from "next/cache";
import { revalidateAllStorefronts, revalidateStorefront } from "@/lib/cache/storefront";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertPlatformPermission, getPlatformContext, type PlatformContext } from "@/lib/platform/access";
import type { PlatformPermission } from "@/lib/permissions/matrix";
import type { VerifyOutcome } from "@/features/domains";
import {
  addPlatformUserSchema,
  changePlanSchema,
  createTenantSchema,
  endSupportSessionSchema,
  extendTrialSchema,
  featureFlagSchema,
  flagKeySchema,
  flagOverrideSchema,
  planIdSchema,
  planSchema,
  supportSessionSchema,
  tenantStatusSchema,
  updatePlatformUserSchema,
} from "./schemas";
import { z } from "zod";
import {
  addPlatformUser,
  changeTenantPlan,
  createTenantForUser,
  deleteFeatureFlag,
  deletePlan,
  endSupportSession,
  extendTrial,
  recheckDomain,
  removePlatformUser,
  saveFeatureFlag,
  savePlan,
  setTenantFlagOverride,
  setTenantStatus,
  startSupportSession,
  updatePlatformSetting,
  updatePlatformUser,
} from "./server/mutations";

/**
 * Super-admin server actions: validate (zod) → authenticate + authorize (platform role
 * permission; non-staff get FORBIDDEN) → execute (RLS-enforced) → audit (in mutations/SQL).
 */

async function platformActor(permission: PlatformPermission): Promise<PlatformContext> {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError("FORBIDDEN");
  assertPlatformPermission(ctx, permission);
  return ctx;
}

const tenantPath = (id: string) => `/admin/tenants/${id}`;

// ---- Tenants ------------------------------------------------------------------------

export async function setTenantStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.tenant.setStatus", async () => {
    const input = parseInput(tenantStatusSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await setTenantStatus(ctx, input);
    revalidateStorefront(input.tenantId);
    revalidatePath(tenantPath(input.tenantId));
    revalidatePath("/admin/stores");
  });
}

export async function changeTenantPlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.tenant.changePlan", async () => {
    const input = parseInput(changePlanSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await changeTenantPlan(ctx, input);
    revalidateStorefront(input.tenantId);
    revalidatePath(tenantPath(input.tenantId));
  });
}

export async function extendTrialAction(_prev: ActionResult<{ trialEndsAt: string }> | null, fd: FormData): Promise<ActionResult<{ trialEndsAt: string }>> {
  return runAction("platform.tenant.extendTrial", async () => {
    const input = parseInput(extendTrialSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    const result = await extendTrial(ctx, input);
    revalidateStorefront(input.tenantId);
    revalidatePath(tenantPath(input.tenantId));
    return result;
  });
}

export async function createTenantAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let tenantId: string | null = null;
  const result = await runAction("platform.tenant.create", async () => {
    const input = parseInput(createTenantSchema, formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    tenantId = await createTenantForUser(ctx, input);
  });
  if (result.ok && tenantId) {
    revalidatePath("/admin/stores");
    redirect(`${tenantPath(tenantId)}?created=1`);
  }
  return result;
}

export async function setFlagOverrideAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.tenant.flagOverride", async () => {
    const input = parseInput(flagOverrideSchema, formToObject(fd));
    const ctx = await platformActor("platform.flags.manage");
    await setTenantFlagOverride(ctx, input);
    revalidateStorefront(input.tenantId);
    revalidatePath(tenantPath(input.tenantId));
  });
}

// ---- Support ------------------------------------------------------------------------

export async function startSupportSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let tenantId: string | null = null;
  const result = await runAction("platform.support.start", async () => {
    const input = parseInput(supportSessionSchema, formToObject(fd));
    const ctx = await platformActor("platform.support.impersonate");
    await rateLimit("support-session", ctx.user.id, 30, 3600);
    await startSupportSession(ctx, input);
    tenantId = input.tenantId;
  });
  if (result.ok && tenantId) {
    revalidatePath("/admin", "layout");
    redirect(`${tenantPath(tenantId)}/support`);
  }
  return result;
}

export async function endSupportSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let tenantId: string | null = null;
  const result = await runAction("platform.support.end", async () => {
    const input = parseInput(endSupportSessionSchema, formToObject(fd));
    // Any platform member may end their OWN session (even after losing the permission).
    const ctx = await getPlatformContext();
    if (!ctx) throw new AppError("FORBIDDEN");
    await endSupportSession(ctx, input.sessionId);
    tenantId = input.tenantId;
  });
  if (result.ok && tenantId) {
    revalidatePath("/admin", "layout");
    redirect(tenantPath(tenantId));
  }
  return result;
}

// ---- Plans --------------------------------------------------------------------------

export async function savePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let created = false;
  const result = await runAction("platform.plan.save", async () => {
    const raw = formToObject(fd);
    const input = parseInput(planSchema, raw);
    const ctx = await platformActor("platform.plans.manage");
    await savePlan(ctx, input, raw);
    revalidateAllStorefronts();
    created = !input.id;
    revalidatePath("/admin/plans");
  });
  if (result.ok && created) redirect("/admin/plans?saved=1");
  return result;
}

export async function deletePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let deleted = false;
  const result = await runAction("platform.plan.delete", async () => {
    const { id } = parseInput(planIdSchema, formToObject(fd));
    const ctx = await platformActor("platform.plans.manage");
    await deletePlan(ctx, id);
    revalidateAllStorefronts();
    deleted = true;
    revalidatePath("/admin/plans");
  });
  if (result.ok && deleted) redirect("/admin/plans?deleted=1");
  return result;
}

// ---- Feature flags ------------------------------------------------------------------

export async function createFeatureFlagAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.flag.create", async () => {
    const input = parseInput(featureFlagSchema, formToObject(fd));
    const ctx = await platformActor("platform.flags.manage");
    await saveFeatureFlag(ctx, input, "create");
    revalidateAllStorefronts();
    revalidatePath("/admin/flags");
  });
}

export async function updateFeatureFlagAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.flag.update", async () => {
    const input = parseInput(featureFlagSchema, formToObject(fd));
    const ctx = await platformActor("platform.flags.manage");
    await saveFeatureFlag(ctx, input, "update");
    revalidateAllStorefronts();
    revalidatePath("/admin/flags");
  });
}

export async function deleteFeatureFlagAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.flag.delete", async () => {
    const { key } = parseInput(flagKeySchema, formToObject(fd));
    const ctx = await platformActor("platform.flags.manage");
    await deleteFeatureFlag(ctx, key);
    revalidateAllStorefronts();
    revalidatePath("/admin/flags");
  });
}

// ---- Platform users -----------------------------------------------------------------

export async function addPlatformUserAction(_prev: ActionResult<{ email: string }> | null, fd: FormData): Promise<ActionResult<{ email: string }>> {
  return runAction("platform.user.add", async () => {
    const input = parseInput(addPlatformUserSchema, formToObject(fd));
    const ctx = await platformActor("platform.users.manage");
    await addPlatformUser(ctx, input);
    revalidatePath("/admin/users");
    return { email: input.email };
  });
}

export async function updatePlatformUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.user.update", async () => {
    const input = parseInput(updatePlatformUserSchema, formToObject(fd));
    const ctx = await platformActor("platform.users.manage");
    await updatePlatformUser(ctx, input);
    revalidatePath("/admin/users");
  });
}

export async function removePlatformUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.user.remove", async () => {
    const { userId } = parseInput(z.object({ userId: z.uuid() }), formToObject(fd));
    const ctx = await platformActor("platform.users.manage");
    await removePlatformUser(ctx, userId);
    revalidatePath("/admin/users");
  });
}

// ---- Settings -----------------------------------------------------------------------

export async function updatePlatformSettingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.setting.update", async () => {
    const raw = formToObject(fd);
    const { key } = parseInput(z.object({ key: z.string().regex(/^[a-z0-9_.]{2,60}$/) }), raw);
    const ctx = await platformActor("platform.settings.manage");
    await updatePlatformSetting(ctx, key, raw.value);
    revalidatePath("/admin/settings");
  });
}

// ---- Domains ------------------------------------------------------------------------

export async function recheckDomainAction(_prev: ActionResult<VerifyOutcome> | null, fd: FormData): Promise<ActionResult<VerifyOutcome>> {
  return runAction("platform.domain.recheck", async () => {
    const { domainId } = parseInput(z.object({ domainId: z.uuid() }), formToObject(fd));
    const ctx = await platformActor("platform.tenants.manage");
    await rateLimit("domain-verify", domainId, 6, 600);
    const { tenantId, ...outcome } = await recheckDomain(ctx, domainId);
    revalidateStorefront(tenantId);
    revalidatePath("/admin/domains");
    revalidatePath(tenantPath(tenantId));
    return outcome;
  });
}
