/**
 * Single source of truth for roles and permissions.
 * - The app uses `can()` for UI gating and server-side authorization.
 * - Migrations seed `role_permissions` from these constants (see tests/unit/permissions-sql.test.ts),
 *   and RLS policies call `app.has_tenant_permission(tenant_id, key)`.
 * - Tenants may also define CUSTOM roles (table tenant_custom_roles) from TENANT_PERMISSIONS.
 * UI checks are convenience only; the server check + RLS are the real boundary.
 */

export const TENANT_PERMISSIONS = [
  "store.read",
  "catalog.read",
  "catalog.write",
  "catalog.delete",
  "catalog.publish",
  "inventory.read",
  "inventory.write",
  "orders.read",
  "orders.write",
  "orders.cancel",
  "orders.refund",
  "customers.read",
  "customers.write",
  "marketing.read",
  "marketing.write",
  "content.write",
  "theme.edit",
  "theme.publish",
  "reviews.moderate",
  "analytics.read",
  "settings.write",
  "payments.manage",
  "domains.manage",
  "members.read",
  "members.manage",
  "roles.manage",
  "billing.manage",
] as const;
export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

/** Permissions a custom role may never hold (owner-only). */
export const OWNER_ONLY_PERMISSIONS: readonly TenantPermission[] = ["billing.manage"];

export const TENANT_ROLES = [
  "owner",
  "admin",
  "manager",
  "catalog_manager",
  "order_manager",
  "inventory_manager",
  "marketing_manager",
  "content_manager",
  "analyst",
  "support_agent",
  "staff",
  "viewer",
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
/** Stored in tenant_memberships.role when the member has a tenant-defined custom role. */
export const CUSTOM_ROLE = "custom" as const;
export type MembershipRole = TenantRole | typeof CUSTOM_ROLE;

const READ_ONLY: TenantPermission[] = ["store.read", "catalog.read", "inventory.read", "orders.read", "customers.read", "marketing.read", "analytics.read"];

/** Legacy general-purpose staff role: day-to-day catalogue and order work. */
const STAFF: TenantPermission[] = [...READ_ONLY, "catalog.write", "catalog.delete", "catalog.publish", "inventory.write", "orders.write", "orders.cancel", "customers.write"];

const MANAGER: TenantPermission[] = [...STAFF, "orders.refund", "marketing.write", "content.write", "theme.edit", "reviews.moderate", "members.read"];

const ADMIN: TenantPermission[] = [...MANAGER, "theme.publish", "settings.write", "payments.manage", "domains.manage", "members.manage", "roles.manage"];

export const TENANT_ROLE_PERMISSIONS: Readonly<Record<TenantRole, ReadonlySet<TenantPermission>>> = {
  owner: new Set(TENANT_PERMISSIONS),
  admin: new Set(ADMIN),
  manager: new Set(MANAGER),
  catalog_manager: new Set(["store.read", "catalog.read", "catalog.write", "catalog.delete", "catalog.publish", "inventory.read", "inventory.write"]),
  order_manager: new Set(["store.read", "catalog.read", "inventory.read", "orders.read", "orders.write", "orders.cancel", "orders.refund", "customers.read", "customers.write"]),
  inventory_manager: new Set(["store.read", "catalog.read", "inventory.read", "inventory.write", "orders.read"]),
  marketing_manager: new Set(["store.read", "catalog.read", "customers.read", "marketing.read", "marketing.write", "reviews.moderate", "analytics.read"]),
  content_manager: new Set(["store.read", "catalog.read", "content.write", "theme.edit"]),
  analyst: new Set(READ_ONLY),
  support_agent: new Set(["store.read", "catalog.read", "orders.read", "orders.write", "customers.read", "customers.write", "reviews.moderate"]),
  staff: new Set(STAFF),
  viewer: new Set(READ_ONLY),
};

export const PLATFORM_PERMISSIONS = [
  "platform.tenants.read",
  "platform.tenants.manage",
  "platform.plans.manage",
  "platform.flags.manage",
  "platform.users.manage",
  "platform.audit.read",
  "platform.support.impersonate",
  "platform.settings.manage",
  "platform.usage.read",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLES = ["super_admin", "support", "finance"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformRole, ReadonlySet<PlatformPermission>>> = {
  super_admin: new Set(PLATFORM_PERMISSIONS),
  support: new Set(["platform.tenants.read", "platform.audit.read", "platform.support.impersonate", "platform.usage.read"]),
  finance: new Set(["platform.tenants.read", "platform.plans.manage", "platform.usage.read"]),
};

export function tenantRoleCan(role: TenantRole, permission: TenantPermission): boolean {
  return TENANT_ROLE_PERMISSIONS[role].has(permission);
}

export function platformRoleCan(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role].has(permission);
}

export function isTenantPermission(v: string): v is TenantPermission {
  return (TENANT_PERMISSIONS as readonly string[]).includes(v);
}
