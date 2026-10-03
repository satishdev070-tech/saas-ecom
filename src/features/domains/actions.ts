"use server";

import { revalidatePath } from "next/cache";
import { revalidateStorefront } from "@/lib/cache/storefront";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { requireTenant } from "@/lib/tenant/membership";
import { rateLimit } from "@/lib/rate-limit";
import { addDomainSchema, domainIdSchema } from "./rules";
import { addCustomDomain, removeCustomDomain, setPrimaryDomain, verifyTenantDomain, type VerifyOutcome } from "./server/service";

const PATH = "/dashboard/settings/domains";

export async function addDomainAction(_prev: ActionResult<{ hostname: string }> | null, fd: FormData): Promise<ActionResult<{ hostname: string }>> {
  return runAction("domains.add", async () => {
    const input = parseInput(addDomainSchema, formToObject(fd));
    const ctx = await requireTenant();
    await rateLimit("domain-add", ctx.tenantId, 20, 3600);
    const row = await addCustomDomain(ctx, input.hostname);
    revalidatePath(PATH);
    revalidateStorefront(ctx.tenantId);
    return { hostname: row.hostname };
  });
}

export async function verifyDomainAction(_prev: ActionResult<VerifyOutcome> | null, fd: FormData): Promise<ActionResult<VerifyOutcome>> {
  return runAction("domains.verify", async () => {
    const { domainId } = parseInput(domainIdSchema, formToObject(fd));
    const ctx = await requireTenant();
    // DNS lookups are external calls: cap per domain and per store.
    await rateLimit("domain-verify", domainId, 6, 600);
    await rateLimit("domain-verify-tenant", ctx.tenantId, 40, 3600);
    const outcome = await verifyTenantDomain(ctx, domainId);
    revalidatePath(PATH);
    revalidateStorefront(ctx.tenantId);
    return outcome;
  });
}

export async function setPrimaryDomainAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("domains.setPrimary", async () => {
    const { domainId } = parseInput(domainIdSchema, formToObject(fd));
    const ctx = await requireTenant();
    await setPrimaryDomain(ctx, domainId);
    revalidatePath(PATH);
    revalidateStorefront(ctx.tenantId);
  });
}

export async function removeDomainAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("domains.remove", async () => {
    const { domainId } = parseInput(domainIdSchema, formToObject(fd));
    const ctx = await requireTenant();
    await removeCustomDomain(ctx, domainId);
    revalidatePath(PATH);
    revalidateStorefront(ctx.tenantId);
  });
}
