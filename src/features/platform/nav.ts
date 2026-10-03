import type { PlatformPermission } from "@/lib/permissions/matrix";
import type { NavIconName } from "@/components/app-shell/icons";

/**
 * Super-admin navigation (single source). Items are hidden when the platform role lacks the
 * permission; each page also calls requirePlatform(permission) and RLS enforces the same keys.
 */
export type AdminNavItem = { href: string; label: string; permission: PlatformPermission; icon: NavIconName };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", permission: "platform.tenants.read", icon: "dashboard" }],
  },
  {
    label: "Stores",
    items: [
      { href: "/admin/stores", label: "Stores", permission: "platform.tenants.read", icon: "stores" },
      { href: "/admin/domains", label: "Domains", permission: "platform.tenants.read", icon: "domains" },
      { href: "/admin/support", label: "Support sessions", permission: "platform.support.impersonate", icon: "support" },
    ],
  },
  {
    label: "Billing & features",
    items: [
      { href: "/admin/plans", label: "Plans", permission: "platform.plans.manage", icon: "plans" },
      { href: "/admin/flags", label: "Feature flags", permission: "platform.flags.manage", icon: "flags" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/admin/usage", label: "Usage & storage", permission: "platform.usage.read", icon: "usage" },
      { href: "/admin/audit", label: "Audit log", permission: "platform.audit.read", icon: "audit" },
      { href: "/admin/integrations", label: "Store integrations", permission: "platform.settings.manage", icon: "integrations" },
      { href: "/admin/social-apps", label: "Social apps", permission: "platform.settings.manage", icon: "integrations" },
      { href: "/admin/health", label: "Platform health", permission: "platform.settings.manage", icon: "activity" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/users", label: "Platform users", permission: "platform.users.manage", icon: "users" },
      { href: "/admin/settings", label: "Settings", permission: "platform.settings.manage", icon: "settings" },
    ],
  },
];

export function adminNavFor(permissions: ReadonlySet<PlatformPermission>): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => permissions.has(i.permission)) })).filter((g) => g.items.length > 0);
}

/** "/admin" is active only on itself; other items also match their sub-pages. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  // Store detail pages live under /admin/tenants/{id}.
  if (href === "/admin/stores" && pathname.startsWith("/admin/tenants")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
