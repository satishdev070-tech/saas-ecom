import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { landingPathFor } from "@/lib/auth/landing";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { TENANT_ROLE_PERMISSIONS, isTenantPermission, type MembershipRole, type TenantPermission, type TenantRole } from "@/lib/permissions/matrix";
import type { TenantStatus } from "./context";

/** Cookie holding the seller's currently selected store. Only a HINT: always re-checked against memberships. */
export const ACTIVE_TENANT_COOKIE = "paliya_tenant";

export type Membership = {
  tenantId: string;
  role: MembershipRole;
  /** Set when role === "custom" (tenant-defined role). */
  customRole: { id: string; name: string; permissions: TenantPermission[] } | null;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
};

/** Dashboard request context. Everything tenant-scoped in the dashboard receives this. */
export type TenantContext = {
  user: SessionUser;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: MembershipRole;
  customRoleName: string | null;
  permissions: ReadonlySet<TenantPermission>;
  memberships: Membership[];
};

/** Effective permissions of a membership: system role from the matrix, custom role from the DB. */
export function membershipPermissions(m: Pick<Membership, "role" | "customRole">): ReadonlySet<TenantPermission> {
  if (m.role === "custom") return new Set(m.customRole?.permissions ?? []);
  return TENANT_ROLE_PERMISSIONS[m.role as TenantRole] ?? new Set();
}

export const listMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("role, tenant_id, tenants!inner(id, name, slug, status), tenant_custom_roles(id, name, permissions)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  return (data ?? []).map((m) => ({
    tenantId: m.tenant_id,
    role: m.role as MembershipRole,
    customRole: m.tenant_custom_roles
      ? { id: m.tenant_custom_roles.id, name: m.tenant_custom_roles.name, permissions: m.tenant_custom_roles.permissions.filter(isTenantPermission) }
      : null,
    tenantName: m.tenants.name,
    tenantSlug: m.tenants.slug,
    tenantStatus: m.tenants.status as TenantStatus,
  }));
});

/**
 * Resolves the active tenant for the signed-in seller from their memberships (never from
 * request input). Redirects to the seller login when signed out, to /admin for platform staff
 * without a store, and to /onboarding for everyone else without a store.
 */
export const requireTenant = cache(async (): Promise<TenantContext> => {
  const user = await requireUser();
  const memberships = await listMemberships(user.id);
  if (memberships.length === 0) redirect(await landingPathFor(user.id));
  const hinted = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  const active = memberships.find((m) => m.tenantId === hinted) ?? memberships[0]!;
  return {
    user,
    tenantId: active.tenantId,
    tenantName: active.tenantName,
    tenantSlug: active.tenantSlug,
    tenantStatus: active.tenantStatus,
    role: active.role,
    customRoleName: active.customRole?.name ?? null,
    permissions: membershipPermissions(active),
    memberships,
  };
});

export function can(ctx: Pick<TenantContext, "permissions">, permission: TenantPermission): boolean {
  return ctx.permissions.has(permission);
}

/** Throws FORBIDDEN (for server actions). RLS enforces the same rule in the database. */
export function assertPermission(ctx: Pick<TenantContext, "permissions">, permission: TenantPermission): void {
  if (!ctx.permissions.has(permission)) throw new AppError("FORBIDDEN", { context: { permission } });
}

/** For pages: requireTenant + permission, redirecting to the dashboard home with a notice when missing. */
export async function requireTenantPermission(permission: TenantPermission): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!can(ctx, permission)) redirect("/dashboard?denied=1");
  return ctx;
}
