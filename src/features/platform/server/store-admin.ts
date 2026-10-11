import "server-only";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/observability/logger";
import { publicEnv } from "@/lib/env/public";
import { signToken, verifyToken, randomToken } from "@/lib/crypto";
import { platformOrigin, storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { assertPlatformPermission, type PlatformContext } from "@/lib/platform/access";
import { ACTIVE_TENANT_COOKIE } from "@/lib/tenant/membership";
import type { Database, Json } from "@/lib/supabase/database.types";
import { PLATFORM_NAME } from "@/config/platform";
import { sendEmail, type EmailSendResult } from "@/lib/email/send";
import { isIndustry } from "@/features/stores/industries";
import { DEFAULT_THEME_CONFIG } from "@/features/theme/default-theme";
import { parseThemeConfigStrict } from "@/features/theme/schema/config";
import { findMarketplaceTheme } from "@/features/theme/marketplace/catalog";
import { applyThemePreset } from "@/features/theme/marketplace/apply";
import { renderAdminPasswordResetEmail, renderPasswordChangedEmail, renderStoreCreatedEmail } from "@/features/notifications/email/account-templates";
import type { EmailBrand } from "@/features/notifications/email/layout";
import { brandImageView, getPublicPlatformConfig } from "./public-config";
import { findUserIdByEmail } from "./queries";
import type { AdminCreateStoreInput } from "../schemas";

/**
 * Store administration for platform staff: create a store with full control (owner account,
 * plan, trial, industry, theme, launch state), reset a store member's password, and sign in as a
 * store member. Every function checks the platform permission first; privileged writes use the
 * secret-key client only after that check (ADR-006) and are audited with actor type "platform".
 *
 * Accounts of platform staff can never be targeted here (no password reset / sign-in as another
 * admin through a store they belong to).
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function formError(message: string, field = "_form"): AppError {
  return new AppError("VALIDATION", { message, fieldErrors: { [field]: [message] } });
}

function requireSuperAdmin(ctx: PlatformContext) {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  if (ctx.role !== "super_admin") throw new AppError("FORBIDDEN", { message: "Only super admins can do this." });
}

async function platformBrand(): Promise<EmailBrand> {
  const logo = brandImageView((await getPublicPlatformConfig()).headerLogo);
  return { storeName: PLATFORM_NAME, logoUrl: logo?.src ?? null, storeUrl: platformOrigin(), accent: null, supportEmail: null };
}

/** One-time recovery link that lands on our /auth/confirm (token hash; works in any browser). */
async function recoveryLink(admin: Admin, email: string, next = "/reset-password"): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new AppError("INTERNAL", { message: "Couldn't create a reset link.", context: { error: error?.message } });
  const url = new URL("/auth/confirm", platformOrigin());
  url.searchParams.set("token_hash", hash);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", next);
  return url.toString();
}

// ---- Create store ------------------------------------------------------------------------

export type CreateStoreResult = { tenantId: string; notes: string[] };

export async function createStoreAsAdmin(ctx: PlatformContext, input: AdminCreateStoreInput): Promise<CreateStoreResult> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  if (input.ownerMode === "new" && ctx.role !== "super_admin") throw formError("Only super admins can create accounts for sellers.", "ownerMode");
  const admin = createSupabaseAdminClient();
  const notes: string[] = [];
  const email = input.ownerEmail.trim().toLowerCase();

  // 1. Owner account.
  let ownerId = await findUserIdByEmail(email);
  let createdUser = false;
  if (input.ownerMode === "existing") {
    if (!ownerId) throw formError("No account uses this email yet. Choose “Create a new account”.", "ownerEmail");
  } else {
    if (ownerId) throw formError("An account with this email already exists. Choose “Existing account”.", "ownerEmail");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.ownerPassword ?? `${randomToken(24)}aA1`,
      email_confirm: true,
      user_metadata: { display_name: input.ownerName ?? null, created_by_platform: true },
    });
    if (error || !data.user) {
      logger.warn("platform.create_owner_failed", { error: error?.message });
      throw formError(error?.message?.includes("already") ? "An account with this email already exists." : "Couldn't create the owner account.", "ownerEmail");
    }
    ownerId = data.user.id;
    createdUser = true;
    if (input.ownerName) await admin.from("profiles").update({ display_name: input.ownerName }).eq("id", ownerId);
    await audit({ tenantId: null, actorUserId: ctx.user.id, actorType: "platform", action: "platform.user_created_for_store", entityType: "user", entityId: ownerId, metadata: { email_domain: email.split("@")[1] ?? null, password_set: Boolean(input.ownerPassword) } });
  }

  // 2. Tenant + store + subdomain + owner membership (SQL function re-checks the permission and audits).
  const supabase = await createSupabaseServerClient();
  const { data: tenantId, error } = await supabase.rpc("platform_create_tenant", {
    p_owner: ownerId!,
    p_name: input.name,
    p_slug: input.slug,
    p_root_domain: publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN,
    ...(input.planId ? { p_plan: input.planId } : {}),
    p_status: input.status,
  });
  if (error || !tenantId) {
    if (createdUser) await admin.auth.admin.deleteUser(ownerId!).catch(() => undefined); // don't leave an orphan account
    if (error?.code === "23505") throw formError("That store address is taken", "slug");
    if (error?.hint === "PLAN_NOT_FOUND") throw formError("Choose a plan", "planId");
    throw error ? mapDbError(error) : new AppError("INTERNAL");
  }

  // 3. Store details. Each step is independent: a failure is reported, the store still exists.
  const storePatch: Database["public"]["Tables"]["stores"]["Update"] = {};
  if (input.storeEmail) storePatch.email = input.storeEmail;
  if (input.storePhone) storePatch.phone = input.storePhone;
  if (input.category && isIndustry(input.category)) {
    const { data: cat } = await admin.from("store_categories").select("id").eq("slug", input.category).maybeSingle();
    if (cat) storePatch.category_id = cat.id;
    else notes.push("Industry not found in the database (apply migration 2700); set it later.");
  }
  storePatch.launch_status = input.launch;
  if (input.launch === "live") storePatch.launched_at = new Date().toISOString();
  let res = await admin.from("stores").update(storePatch).eq("tenant_id", tenantId);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    // Database without migration 2400 (launch_status): retry without launch columns.
    delete storePatch.launch_status;
    delete storePatch.launched_at;
    res = await admin.from("stores").update(storePatch).eq("tenant_id", tenantId);
    notes.push("Launch state needs migration 2400; the store is live.");
  }
  if (res.error) notes.push("Store contact details/industry couldn't be saved; edit them in the store settings.");

  const tenantPatch: Database["public"]["Tables"]["tenants"]["Update"] = {};
  if (input.storeType !== "real") tenantPatch.store_type = input.storeType;
  if (input.status === "trial" && input.trialDays) tenantPatch.trial_ends_at = new Date(Date.now() + input.trialDays * 86_400_000).toISOString();
  if (Object.keys(tenantPatch).length) {
    const { error: tErr } = await admin.from("tenants").update(tenantPatch).eq("id", tenantId);
    if (tErr) notes.push("Store type / trial length couldn't be saved.");
  }

  // 4. Theme: preset applied onto the default config, as a draft or published straight away.
  let themeApplied: string | null = null;
  if (input.themeKey) {
    const theme = findMarketplaceTheme(input.themeKey);
    if (!theme) notes.push("Unknown theme; the default theme is used.");
    else {
      const parsed = parseThemeConfigStrict(applyThemePreset(structuredClone(DEFAULT_THEME_CONFIG), theme.preset));
      if (!parsed.ok) notes.push(`${theme.name} couldn't be applied; the default theme is used.`);
      else {
        const { error: thErr } = await admin.from("theme_versions").insert({
          tenant_id: tenantId,
          theme_key: theme.key,
          label: theme.name,
          version: 1,
          status: input.publishTheme ? "published" : "draft",
          config: parsed.config as unknown as Json,
          created_by: ctx.user.id,
          ...(input.publishTheme ? { published_at: new Date().toISOString(), published_by: ctx.user.id } : {}),
        });
        if (thErr) notes.push(`${theme.name} couldn't be saved (${thErr.code ?? "error"}); apply it from the theme marketplace.`);
        else themeApplied = theme.key;
      }
    }
  }

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    actorType: "platform",
    action: "tenant.configured_by_platform",
    entityType: "tenant",
    entityId: tenantId,
    metadata: { owner_mode: input.ownerMode, category: input.category ?? null, store_type: input.storeType, launch: input.launch, theme: themeApplied, theme_published: Boolean(themeApplied && input.publishTheme), trial_days: input.trialDays ?? null },
  });

  // 5. Tell the owner (new account → set-password link; existing → dashboard link).
  if (input.notifyOwner) {
    try {
      const actionUrl = createdUser ? await recoveryLink(admin, email, "/reset-password") : `${platformOrigin()}/seller/login`;
      const mail = renderStoreCreatedEmail({ brand: await platformBrand(), storeName: input.name, storeUrl: storeOrigin(storeSubdomain(input.slug)), actionUrl, newAccount: createdUser, ownerName: input.ownerName ?? null });
      const r = await sendEmail({ tenantId, kind: "platform_store_created", to: email, ...mail, fromName: PLATFORM_NAME, idempotencyKey: `store-created:${tenantId}` });
      if (r.status !== "sent") notes.push(r.status === "logged" ? "Welcome email not sent: Resend isn't configured (Admin → Email)." : "Welcome email couldn't be sent.");
    } catch (err) {
      logger.warn("platform.store_created_email_failed", { tenantId, error: err });
      notes.push("Welcome email couldn't be sent.");
    }
  }
  return { tenantId, notes };
}

// ---- Account access: password reset / set password / sign in as --------------------------

type Target = { userId: string; email: string; role: string; storeName: string };

/** The member must belong to the store and must not be platform staff. */
async function storeMember(admin: Admin, tenantId: string, userId: string): Promise<Target> {
  const [{ data: m }, { data: staff }, { data: store }, { data: user }] = await Promise.all([
    admin.from("tenant_memberships").select("role, status").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle(),
    admin.from("platform_memberships").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("stores").select("name").eq("tenant_id", tenantId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (!m) throw new AppError("NOT_FOUND", { message: "That person isn't a member of this store." });
  if (staff) throw new AppError("FORBIDDEN", { message: "Platform staff accounts can't be managed from a store." });
  const email = user?.user?.email;
  if (!email) throw new AppError("CONFLICT", { message: "This account has no email address." });
  return { userId, email, role: m.role, storeName: store?.name ?? "your store" };
}

/** The owner (first active owner) of a store. */
export async function storeOwnerId(tenantId: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient().from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").eq("status", "active").order("created_at").limit(1).maybeSingle();
  return data?.user_id ?? null;
}

export type ResetLinkResult = { email: string; emailStatus: EmailSendResult["status"]; link: string };

/** Emails a one-time password reset link; the link is also returned so support can share it. */
export async function sendMemberPasswordReset(ctx: PlatformContext, input: { tenantId: string; userId: string; reason: string }): Promise<ResetLinkResult> {
  assertPlatformPermission(ctx, "platform.tenants.manage");
  const admin = createSupabaseAdminClient();
  const t = await storeMember(admin, input.tenantId, input.userId);
  const link = await recoveryLink(admin, t.email);
  const mail = renderAdminPasswordResetEmail({ brand: await platformBrand(), storeName: t.storeName, actionUrl: link });
  const r = await sendEmail({ tenantId: input.tenantId, kind: "platform_password_reset", to: t.email, ...mail, fromName: PLATFORM_NAME, idempotencyKey: `admin-reset:${t.userId}:${randomToken(6)}` });
  await audit({ tenantId: input.tenantId, actorUserId: ctx.user.id, actorType: "platform", action: "member.password_reset_sent", entityType: "user", entityId: t.userId, metadata: { role: t.role, reason: input.reason, email_status: r.status } });
  return { email: t.email, emailStatus: r.status, link };
}

/** Sets a new password directly (super admin only). The password is never logged or emailed. */
export async function setMemberPassword(ctx: PlatformContext, input: { tenantId: string; userId: string; password: string; reason: string; notify: boolean }): Promise<{ email: string }> {
  requireSuperAdmin(ctx);
  const admin = createSupabaseAdminClient();
  const t = await storeMember(admin, input.tenantId, input.userId);
  const { error } = await admin.auth.admin.updateUserById(t.userId, { password: input.password });
  if (error) throw formError(error.message.includes("weak") || error.message.includes("Password") ? "That password was rejected as too weak. Try a longer one." : "Couldn't set the password.", "password");
  await audit({ tenantId: input.tenantId, actorUserId: ctx.user.id, actorType: "platform", action: "member.password_set_by_platform", entityType: "user", entityId: t.userId, metadata: { role: t.role, reason: input.reason, notified: input.notify } });
  if (input.notify) {
    const mail = renderPasswordChangedEmail({ brand: await platformBrand(), storeName: t.storeName, signInUrl: `${platformOrigin()}/seller/login` });
    await sendEmail({ tenantId: input.tenantId, kind: "platform_password_changed", to: t.email, ...mail, fromName: PLATFORM_NAME, idempotencyKey: `admin-pw:${t.userId}:${randomToken(6)}` });
  }
  return { email: t.email };
}

// ---- Sign in as a store member ----------------------------------------------------------------

/** httpOnly cookie marking a support sign-in, so the dashboard can show who is acting and how to stop. */
export const SUPPORT_LOGIN_COOKIE = "bb_support_login";
const SUPPORT_LOGIN_PURPOSE = "support-login";
const SUPPORT_LOGIN_MAX_AGE = 60 * 60 * 2;

export type SupportLogin = { adminId: string; adminEmail: string; tenantId: string; userId: string; storeName: string; exp: number };

export function readSupportLogin(token: string | undefined | null): SupportLogin | null {
  const raw = verifyToken(SUPPORT_LOGIN_PURPOSE, token);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SupportLogin;
    return typeof v.exp === "number" && v.exp > Date.now() ? v : null;
  } catch {
    return null;
  }
}

/**
 * Signs the super admin in AS a store member (the owner by default) and opens that store's
 * dashboard. The admin's own session on this browser is replaced; they sign back in to the
 * console afterwards. Super admin only, reason required, audited before the switch.
 */
export async function signInAsStoreMember(ctx: PlatformContext, input: { tenantId: string; userId?: string; reason: string }): Promise<void> {
  requireSuperAdmin(ctx);
  const admin = createSupabaseAdminClient();
  const userId = input.userId ?? (await storeOwnerId(input.tenantId));
  if (!userId) throw new AppError("CONFLICT", { message: "This store has no active owner to sign in as." });
  if (userId === ctx.user.id) throw new AppError("CONFLICT", { message: "That's your own account." });
  const t = await storeMember(admin, input.tenantId, userId);
  const { data: tenant } = await admin.from("tenants").select("status").eq("id", input.tenantId).maybeSingle();
  if (tenant?.status === "cancelled") throw new AppError("CONFLICT", { message: "This store is closed. Reopen it first." });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: t.email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new AppError("INTERNAL", { message: "Couldn't start the sign-in.", context: { error: error?.message } });

  await audit({ tenantId: input.tenantId, actorUserId: ctx.user.id, actorType: "platform", action: "support.signed_in_as_member", entityType: "user", entityId: t.userId, metadata: { role: t.role, reason: input.reason, admin_email: ctx.user.email ?? null } });

  const supabase = await createSupabaseServerClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (vErr) throw new AppError("INTERNAL", { message: "Couldn't complete the sign-in.", context: { error: vErr.message } });

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(ACTIVE_TENANT_COOKIE, input.tenantId, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 30 });
  const marker: SupportLogin = { adminId: ctx.user.id, adminEmail: ctx.user.email ?? "", tenantId: input.tenantId, userId: t.userId, storeName: t.storeName, exp: Date.now() + SUPPORT_LOGIN_MAX_AGE * 1000 };
  jar.set(SUPPORT_LOGIN_COOKIE, signToken(SUPPORT_LOGIN_PURPOSE, JSON.stringify(marker)), { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: SUPPORT_LOGIN_MAX_AGE });
}

/** Ends a support sign-in: signs out of the member's session and returns to the console login. */
export async function endSupportLogin(): Promise<SupportLogin | null> {
  const jar = await cookies();
  const marker = readSupportLogin(jar.get(SUPPORT_LOGIN_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut({ scope: "local" });
  jar.delete(SUPPORT_LOGIN_COOKIE);
  jar.delete(ACTIVE_TENANT_COOKIE);
  if (marker) {
    await audit({ tenantId: marker.tenantId, actorUserId: marker.adminId, actorType: "platform", action: "support.signed_out_of_member", entityType: "user", entityId: marker.userId, metadata: { session_user: (data?.claims?.sub as string | undefined) ?? null } });
  }
  return marker;
}
