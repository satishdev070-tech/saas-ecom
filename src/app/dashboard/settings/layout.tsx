import { can, requireTenantPermission } from "@/lib/tenant/membership";
import type { TenantPermission } from "@/lib/permissions/matrix";
import { SettingsNav, type SettingsNavGroup } from "@/features/settings/ui/settings-nav";

const GROUPS: { label: string; items: { href: string; label: string; permission: TenantPermission }[] }[] = [
  {
    label: "Store",
    items: [
      { href: "/dashboard/settings", label: "General & branding", permission: "store.read" },
      { href: "/dashboard/themes", label: "Theme", permission: "theme.edit" },
      { href: "/dashboard/settings/domains", label: "Domains", permission: "store.read" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/dashboard/settings/payments", label: "Payments", permission: "payments.manage" },
      { href: "/dashboard/settings/shipping", label: "Shipping & COD", permission: "store.read" },
      { href: "/dashboard/settings/taxes", label: "Taxes", permission: "settings.write" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/dashboard/settings/seo", label: "SEO", permission: "store.read" },
      { href: "/dashboard/settings/analytics", label: "Analytics & tracking", permission: "store.read" },
      { href: "/dashboard/marketing/social/accounts", label: "Social accounts", permission: "marketing.read" },
      { href: "/dashboard/settings/notifications", label: "Notifications", permission: "settings.write" },
    ],
  },
  {
    label: "Access",
    items: [
      { href: "/dashboard/settings/team", label: "Team", permission: "members.read" },
      { href: "/dashboard/settings/roles", label: "Roles & permissions", permission: "roles.manage" },
      { href: "/dashboard/settings/security", label: "Security & activity", permission: "members.manage" },
    ],
  },
];

/** Settings centre: one place for every store setting, filtered by the member's permissions. */
export default async function SettingsLayout({ children }: LayoutProps<"/dashboard/settings">) {
  const ctx = await requireTenantPermission("store.read");
  const groups: SettingsNavGroup[] = GROUPS.map((g) => ({ label: g.label, items: g.items.filter((i) => can(ctx, i.permission)).map(({ href, label }) => ({ href, label })) })).filter((g) => g.items.length);
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <SettingsNav groups={groups} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
