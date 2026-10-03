import "server-only";
import type { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { publicEnv } from "@/lib/env/public";
import { assertPlatformPermission, type PlatformContext } from "@/lib/platform/access";
import type { Json } from "@/lib/supabase/database.types";
import { recheckDomainAsPlatform, type VerifyOutcome } from "@/features/domains";
import {
  extendedTrialEnd,
  planFeaturesFromForm,
  planLimitsJson,
  type PlanInput,
  type addPlatformUserSchema,
  type changePlanSchema,
  type createTenantSchema,
  type extendTrialSchema,
  type featureFlagSchema,
  type flagOverrideSchema,
  type supportSessionSchema,
  type tenantStatusSchema,
  type updatePlatformUserSchema,
} from "../schemas";
import { parseSettingValue, settingDef } from "../settings-registry";
import { findUserIdByEmail } from "./queries";

/**
 * Super-admin mutations. Contract for each: caller already validated input (zod) and
 * resolved the PlatformContext; here we authorize (explicit permission), execute as the
 * signed-in user (RLS + SQL functions re-check platform permissions) and audit with
 * actor type "platform" (support sessions are audited as "support" inside SQL).
 */

type PgError = { code?: string; message?: string; hint?: string; details?: string } | null;

function platformAudit(ctx: PlatformContext, entry: { tenantId?: string | null; action: `${string}.${string}`; entityType: string; entityId: string; metadata?: Record<string, Json | undefined> }) {
  return audit({ tenantId: entry.tenantId ?? null, actorUserId: ctx.user.id, actorType: "platform", action: entry.action, entityType: entry.entityType, entityId: entry.entityId, metadata: entry.metadata });
}

function formError(message: string, field = "_form"): AppError {
  return new AppError("VALIDATION", { fieldErrors: { [field]: [message] } });
}

// ---- Tenants ------------------------------------------------------------------------

export async function setTenantStatus(ctx: PlatformContext, input: z.infer<typeof tenantStatusSchema>): Promise<void> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const supabase = await createSupabaseServerClient();
  // set_tenant_status() re-checks the permission, locks the row and writes the audit entry
  // (actor_type 'platform', with from/to/reason) in the same transaction.
  const { error } = await supabase.rpc("set_tenant_status", { p_tenant: input.tenantId, p_status: input.status, p_reason: input.reason });
  if (error) throw mapDbError(error, { tenantId: input.tenantId });
}

export async function changeTenantPlan(ctx: PlatformContext, input: z.infer<typeof changePlanSchema>): Promise<void> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant, error: tErr }, { data: plan, error: pErr }] = await Promise.all([
    supabase.from("tenants").select("id, plan_id").eq("id", input.tenantId).maybeSingle(),
    supabase.from("plans").select("id, code, name").eq("id", input.planId).maybeSingle(),
  ]);
  if (tErr) throw mapDbError(tErr);
  if (pErr) throw mapDbError(pErr);
  if (!tenant) throw new AppError("NOT_FOUND");
  if (!plan) throw formError("Choose a plan", "planId");
  if (tenant.plan_id === plan.id) return;

  const { data, error } = await supabase.from("tenants").update({ plan_id: plan.id }).eq("id", tenant.id).select("id").maybeSingle();
  if (error) throw mapDbError(error, { tenantId: tenant.id });
  if (!data) throw new AppError("FORBIDDEN");
  await platformAudit(ctx, { tenantId: tenant.id, action: "tenant.plan_changed", entityType: "tenant", entityId: tenant.id, metadata: { from: tenant.plan_id, to: plan.id, plan_code: plan.code } });
}

export async function extendTrial(ctx: PlatformContext, input: z.infer<typeof extendTrialSchema>): Promise<{ trialEndsAt: string }> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const supabase = await createSupabaseServerClient();
  const { data: tenant, error: readError } = await supabase.from("tenants").select("id, status, trial_ends_at").eq("id", input.tenantId).maybeSingle();
  if (readError) throw mapDbError(readError);
  if (!tenant) throw new AppError("NOT_FOUND");
  if (tenant.status !== "trial") throw formError("Only stores on a trial can have their trial extended.");
  const next = extendedTrialEnd(tenant.trial_ends_at, input.days).toISOString();
  const { data, error } = await supabase.from("tenants").update({ trial_ends_at: next }).eq("id", tenant.id).eq("status", "trial").select("id").maybeSingle();
  if (error) throw mapDbError(error, { tenantId: tenant.id });
  if (!data) throw new AppError("CONFLICT");
  await platformAudit(ctx, { tenantId: tenant.id, action: "tenant.trial_extended", entityType: "tenant", entityId: tenant.id, metadata: { from: tenant.trial_ends_at, to: next, days: input.days } });
  return { trialEndsAt: next };
}

/** Onboards a store for an EXISTING account (they sign up first); the account becomes owner. */
export async function createTenantForUser(ctx: PlatformContext, input: z.infer<typeof createTenantSchema>): Promise<string> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const ownerId = await findUserIdByEmail(input.ownerEmail);
  if (!ownerId) throw formError("No account uses this email yet. Ask the seller to sign up first, then try again.", "ownerEmail");

  const supabase = await createSupabaseServerClient();
  // platform_create_tenant() creates tenant + store + subdomain + owner + location and audits
  // (actor_type 'platform') atomically.
  const { data, error } = await supabase.rpc("platform_create_tenant", {
    p_owner: ownerId,
    p_name: input.name,
    p_slug: input.slug,
    p_root_domain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN,
    ...(input.planId ? { p_plan: input.planId } : {}),
    p_status: input.status,
  });
  if (error) {
    if (error.code === "23505") throw formError("That store address is taken", "slug");
    if (error.hint === "PLAN_NOT_FOUND") throw formError("Choose a plan", "planId");
    if (error.hint === "USER_NOT_FOUND") throw formError("No account uses this email yet.", "ownerEmail");
    throw mapDbError(error);
  }
  return data;
}

export async function setTenantFlagOverride(ctx: PlatformContext, input: z.infer<typeof flagOverrideSchema>): Promise<void> {
  assertPlatformPermission(ctx, "platform.flags.manage");
  const supabase = await createSupabaseServerClient();
  const { data: flag, error: flagError } = await supabase.from("feature_flags").select("key").eq("key", input.key).maybeSingle();
  if (flagError) throw mapDbError(flagError);
  if (!flag) throw new AppError("NOT_FOUND");

  if (input.value === "inherit") {
    const { error } = await supabase.from("tenant_feature_flags").delete().eq("tenant_id", input.tenantId).eq("feature_key", input.key);
    if (error) throw mapDbError(error, { tenantId: input.tenantId });
  } else {
    const { error } = await supabase
      .from("tenant_feature_flags")
      .upsert({ tenant_id: input.tenantId, feature_key: input.key, enabled: input.value === "on", updated_at: new Date().toISOString() }, { onConflict: "tenant_id,feature_key" });
    if (error) throw mapDbError(error, { tenantId: input.tenantId });
  }
  await platformAudit(ctx, { tenantId: input.tenantId, action: "tenant.feature_override_set", entityType: "feature_flag", entityId: input.key, metadata: { value: input.value } });
}

// ---- Plans --------------------------------------------------------------------------

export async function savePlan(ctx: PlatformContext, input: PlanInput, raw: Record<string, unknown>): Promise<string> {
  assertPlatformPermission(ctx, "platform.plans.manage");
  const supabase = await createSupabaseServerClient();
  const { data: flags, error: flagsError } = await supabase.from("feature_flags").select("key");
  if (flagsError) throw mapDbError(flagsError);

  const row = {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    price_monthly: Number(input.priceMonthly),
    price_yearly: Number(input.priceYearly),
    trial_days: input.trialDays,
    sort_order: input.sortOrder,
    active: input.active,
    limits: planLimitsJson(input),
    features: planFeaturesFromForm(raw, (flags ?? []).map((f) => f.key)),
  };

  const result = input.id
    ? await supabase.from("plans").update(row).eq("id", input.id).select("id").maybeSingle()
    : await supabase.from("plans").insert(row).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") throw formError("Another plan already uses this code", "code");
    throw mapDbError(result.error);
  }
  if (!result.data) throw new AppError("NOT_FOUND");
  const id = result.data.id;
  await platformAudit(ctx, { action: input.id ? "plan.updated" : "plan.created", entityType: "plan", entityId: id, metadata: { code: row.code, active: row.active, limits: row.limits, features: row.features } });
  return id;
}

export async function deletePlan(ctx: PlatformContext, planId: string): Promise<void> {
  assertPlatformPermission(ctx, "platform.plans.manage");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("plans").delete().eq("id", planId).select("id, code").maybeSingle();
  if (error) {
    if (error.code === "23503") throw formError("Stores are on this plan. Move them to another plan, or deactivate this plan instead.");
    throw mapDbError(error);
  }
  if (!data) throw new AppError("NOT_FOUND");
  await platformAudit(ctx, { action: "plan.deleted", entityType: "plan", entityId: planId, metadata: { code: data.code } });
}

// ---- Feature flags ------------------------------------------------------------------

export async function saveFeatureFlag(ctx: PlatformContext, input: z.infer<typeof featureFlagSchema>, mode: "create" | "update"): Promise<void> {
  assertPlatformPermission(ctx, "platform.flags.manage");
  const supabase = await createSupabaseServerClient();
  if (mode === "create") {
    const { error } = await supabase.from("feature_flags").insert({ key: input.key, description: input.description ?? null, default_enabled: input.defaultEnabled });
    if (error) {
      if (error.code === "23505") throw formError("A flag with this key already exists", "key");
      throw mapDbError(error);
    }
  } else {
    const { data, error } = await supabase
      .from("feature_flags")
      .update({ description: input.description ?? null, default_enabled: input.defaultEnabled })
      .eq("key", input.key)
      .select("key")
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw new AppError("NOT_FOUND");
  }
  await platformAudit(ctx, { action: mode === "create" ? "feature_flag.created" : "feature_flag.updated", entityType: "feature_flag", entityId: input.key, metadata: { default_enabled: input.defaultEnabled } });
}

export async function deleteFeatureFlag(ctx: PlatformContext, key: string): Promise<void> {
  assertPlatformPermission(ctx, "platform.flags.manage");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feature_flags").delete().eq("key", key).select("key").maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  await platformAudit(ctx, { action: "feature_flag.deleted", entityType: "feature_flag", entityId: key });
}

// ---- Platform users -----------------------------------------------------------------

function lastSuperAdmin(error: PgError): boolean {
  return error?.hint === "LAST_SUPER_ADMIN";
}
const LAST_SUPER_ADMIN_MESSAGE = "The platform must keep at least one active super admin. Add another super admin first.";

export async function addPlatformUser(ctx: PlatformContext, input: z.infer<typeof addPlatformUserSchema>): Promise<void> {
  assertPlatformPermission(ctx, "platform.users.manage");
  const userId = await findUserIdByEmail(input.email);
  if (!userId) throw formError("No account uses this email. They need to sign up first.", "email");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("platform_memberships").insert({ user_id: userId, role: input.role, created_by: ctx.user.id });
  if (error) {
    if (error.code === "23505") throw formError("This person already has platform access. Change their role in the list below.", "email");
    throw mapDbError(error);
  }
  await platformAudit(ctx, { action: "platform_user.granted", entityType: "platform_user", entityId: userId, metadata: { role: input.role } });
}

export async function updatePlatformUser(ctx: PlatformContext, input: z.infer<typeof updatePlatformUserSchema>): Promise<void> {
  assertPlatformPermission(ctx, "platform.users.manage");
  if (input.userId === ctx.user.id) throw formError("You can't change your own platform access. Ask another super admin.");
  const supabase = await createSupabaseServerClient();
  const { data: before, error: readError } = await supabase.from("platform_memberships").select("role, status").eq("user_id", input.userId).maybeSingle();
  if (readError) throw mapDbError(readError);
  if (!before) throw new AppError("NOT_FOUND");
  if (before.role === input.role && before.status === input.status) return;
  const { error } = await supabase.from("platform_memberships").update({ role: input.role, status: input.status }).eq("user_id", input.userId);
  if (error) {
    if (lastSuperAdmin(error)) throw formError(LAST_SUPER_ADMIN_MESSAGE);
    throw mapDbError(error);
  }
  await platformAudit(ctx, { action: "platform_user.updated", entityType: "platform_user", entityId: input.userId, metadata: { from: before, to: { role: input.role, status: input.status } } });
}

export async function removePlatformUser(ctx: PlatformContext, userId: string): Promise<void> {
  assertPlatformPermission(ctx, "platform.users.manage");
  if (userId === ctx.user.id) throw formError("You can't remove your own platform access. Ask another super admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("platform_memberships").delete().eq("user_id", userId).select("role").maybeSingle();
  if (error) {
    if (lastSuperAdmin(error)) throw formError(LAST_SUPER_ADMIN_MESSAGE);
    throw mapDbError(error);
  }
  if (!data) throw new AppError("NOT_FOUND");
  await platformAudit(ctx, { action: "platform_user.revoked", entityType: "platform_user", entityId: userId, metadata: { role: data.role } });
}

// ---- Settings -----------------------------------------------------------------------

export async function updatePlatformSetting(ctx: PlatformContext, key: string, rawValue: unknown): Promise<void> {
  assertPlatformPermission(ctx, "platform.settings.manage");
  if (!settingDef(key)) throw new AppError("NOT_FOUND");
  const parsed = parseSettingValue(key, rawValue);
  if (!parsed.ok) throw formError(parsed.message, "value");
  const supabase = await createSupabaseServerClient();
  const { data: before } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value: parsed.value as Json, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw mapDbError(error);
  await platformAudit(ctx, { action: "platform_setting.updated", entityType: "platform_setting", entityId: key, metadata: { from: before?.value ?? null, to: parsed.value as Json } });
}

// ---- Support access -----------------------------------------------------------------

/** Starts (or restarts) an expiring, read-only support session. Audited inside SQL. */
export async function startSupportSession(ctx: PlatformContext, input: z.infer<typeof supportSessionSchema>): Promise<string> {
  assertPlatformPermission(ctx, "platform.support.impersonate");
  const supabase = await createSupabaseServerClient();
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").eq("id", input.tenantId).maybeSingle();
  if (tErr) throw mapDbError(tErr);
  if (!tenant) throw new AppError("NOT_FOUND");
  const { data, error } = await supabase.rpc("start_support_session", { p_tenant: input.tenantId, p_reason: input.reason, p_minutes: input.minutes });
  if (error) throw mapDbError(error, { tenantId: input.tenantId });
  return data;
}

/** Ends one of the caller's own sessions (SQL only matches sessions they started). Audited inside SQL. */
export async function endSupportSession(ctx: PlatformContext, sessionId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("end_support_session", { p_session: sessionId });
  if (error) throw mapDbError(error, { sessionId, userId: ctx.user.id });
}

// ---- Domains ------------------------------------------------------------------------

export async function recheckDomain(ctx: PlatformContext, domainId: string): Promise<VerifyOutcome & { tenantId: string }> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const outcome = await recheckDomainAsPlatform(domainId, ctx.user.id);
  await platformAudit(ctx, {
    tenantId: outcome.tenantId,
    action: "domain.rechecked",
    entityType: "domain",
    entityId: domainId,
    metadata: { status: outcome.status, ssl_status: outcome.sslStatus, verified: outcome.verified },
  });
  return outcome;
}
