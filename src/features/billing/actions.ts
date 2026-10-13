"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { assertPlatformPermission, getPlatformContext } from "@/lib/platform/access";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { changeTenantPlan, setTenantStatus } from "@/features/platform/server/mutations";
import { activatePlanSchema, cancelPlanRequestSchema, decidePlanRequestSchema, requestPlanSchema } from "./schemas";
import { cancelPlanRequest, decidePlanRequest, requestPlan } from "./server";

/** Seller (owner): ask for a plan. Validate → membership → billing.manage → SQL function (audits). */
export async function requestPlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("billing.requestPlan", async () => {
    const input = parseInput(requestPlanSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "billing.manage");
    await rateLimit("plan-request", ctx.tenantId, 10, 3600);
    await requestPlan(ctx, input);
  });
  if (result.ok) revalidatePath("/dashboard/settings/plan");
  return result;
}

export async function cancelPlanRequestAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("billing.cancelRequest", async () => {
    const input = parseInput(cancelPlanRequestSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "billing.manage");
    await cancelPlanRequest(ctx, input.requestId);
  });
  if (result.ok) revalidatePath("/dashboard/settings/plan");
  return result;
}

async function platformManager() {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError("FORBIDDEN");
  assertPlatformPermission(ctx, "platform.tenants.manage");
  return ctx;
}

/** Platform: approve (switch plan + activate the store) or decline a request. */
export async function decidePlanRequestAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.planRequest.decide", async () => {
    const input = parseInput(decidePlanRequestSchema, formToObject(fd));
    const ctx = await platformManager();
    const { tenantId } = await decidePlanRequest(ctx, input);
    revalidateStorefront(tenantId);
    revalidatePath(`/admin/tenants/${tenantId}`);
    revalidatePath("/admin/plan-requests");
    revalidatePath("/admin/stores");
  });
}

/** Platform: put a store on a plan and make it active (paid) in one step, without a request. */
export async function activatePlanAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("platform.tenant.activatePlan", async () => {
    const input = parseInput(activatePlanSchema, formToObject(fd));
    const ctx = await platformManager();
    await changeTenantPlan(ctx, { tenantId: input.tenantId, planId: input.planId });
    await setTenantStatus(ctx, { tenantId: input.tenantId, status: "active", reason: input.reason, confirm: "yes" } as Parameters<typeof setTenantStatus>[1]);
    revalidateStorefront(input.tenantId);
    revalidatePath(`/admin/tenants/${input.tenantId}`);
    revalidatePath("/admin/stores");
  });
}
