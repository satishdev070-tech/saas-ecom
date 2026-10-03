"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { audit } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { rateLimit } from "@/lib/rate-limit";
import { PROVIDERS, isProviderId, type ProviderId } from "./registry";
import { disconnect, loadIntegration, recordStatus, saveCredentials, setEnabled } from "./server/store";
import { testProvider, type TestResult } from "./server/testers";

const providerSchema = z.object({ provider: z.string().refine(isProviderId, "Unknown provider") });

async function runTest(tenantId: string, userId: string, provider: ProviderId): Promise<TestResult> {
  const it = await loadIntegration(tenantId, provider);
  if (!it) throw new AppError("CONFLICT", { message: `Save ${PROVIDERS[provider].label} credentials first.` });
  const res = await testProvider(it);
  await recordStatus(tenantId, provider, res.ok ? "connected" : "error", res.message);
  await audit({ tenantId, actorUserId: userId, action: "integration.tested", entityType: "integration", entityId: provider, metadata: { provider, ok: res.ok } });
  return res;
}

function testOutcome(res: TestResult) {
  if (!res.ok) throw new AppError("VALIDATION", { message: res.message, fieldErrors: { _form: [res.message] } });
  return res.message;
}

/** Save credentials, then immediately test them; the status reflects the real test result. */
export async function saveIntegrationAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("integrations.save", async () => {
    const ctx = await requireTenant();
    const raw = formToObject(fd) as Record<string, string>;
    const { provider } = parseInput(providerSchema, raw);
    const p = provider as ProviderId;
    const def = PROVIDERS[p];
    const values = Object.fromEntries(def.fields.map((f) => [f.key, typeof raw[f.key] === "string" ? raw[f.key]! : ""]));
    const environment = raw.environment === "live" ? "live" : "test";
    await saveCredentials(ctx, p, values, environment);
    await rateLimit("integration-test", ctx.tenantId, 20, 600);
    return testOutcome(await runTest(ctx.tenantId, ctx.user.id, p));
  });
  refresh();
  return result;
}

export async function testIntegrationAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("integrations.test", async () => {
    const ctx = await requireTenant();
    const { provider } = parseInput(providerSchema, formToObject(fd));
    const p = provider as ProviderId;
    assertPermission(ctx, PROVIDERS[p].permission);
    await rateLimit("integration-test", ctx.tenantId, 20, 600);
    return testOutcome(await runTest(ctx.tenantId, ctx.user.id, p));
  });
  refresh();
  return result;
}

export async function toggleIntegrationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("integrations.toggle", async () => {
    const ctx = await requireTenant();
    const v = parseInput(providerSchema.extend({ enabled: z.enum(["true", "false"]) }), formToObject(fd));
    await setEnabled(ctx, v.provider as ProviderId, v.enabled === "true");
  });
  if (result.ok) refresh();
  return result;
}

export async function disconnectIntegrationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("integrations.disconnect", async () => {
    const ctx = await requireTenant();
    const { provider } = parseInput(providerSchema, formToObject(fd));
    await disconnect(ctx, provider as ProviderId);
  });
  if (result.ok) refresh();
  return result;
}

/** Which connected courier books shipments by default (stores.integrations.default_courier). */
export async function setDefaultCourierAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("integrations.default_courier", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "settings.write");
    const v = parseInput(z.object({ courier: z.enum(["shiprocket", "delhivery"]) }), formToObject(fd));
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("stores").select("integrations").eq("tenant_id", ctx.tenantId).single();
    const integrations = { ...((data?.integrations as Record<string, unknown>) ?? {}), default_courier: v.courier };
    const { error } = await supabase.from("stores").update({ integrations }).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "integration.default_courier_changed", entityType: "store", entityId: ctx.tenantId, metadata: { courier: v.courier } });
  });
  if (result.ok) refresh();
  return result;
}
