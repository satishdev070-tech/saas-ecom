import type { TenantPermission } from "@/lib/permissions/matrix";
import type { NavIconName } from "@/components/app-shell/icons";

/**
 * Seller dashboard navigation (single source). Each module's pages live under the href.
 * Items are hidden when the member's role lacks the permission; the page itself also
 * checks with requireTenantPermission(), and RLS enforces it in the database.
 */
export type NavItem = { href: string; label: string; permission: string; icon: NavIconName };
export type NavGroup = { label: string; items: NavItem[] };

type TenantNavItem = NavItem & { permission: TenantPermission };

export const DASHBOARD_NAV: { label: string; items: TenantNavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", permission: "store.read", icon: "dashboard" }],
  },
  {
    label: "Commerce",
    items: [
      { href: "/dashboard/orders", label: "Orders", permission: "orders.read", icon: "orders" },
      { href: "/dashboard/returns", label: "Returns", permission: "orders.read", icon: "returns" },
      { href: "/dashboard/products", label: "Products", permission: "catalog.read", icon: "products" },
      { href: "/dashboard/collections", label: "Collections", permission: "catalog.read", icon: "collections" },
      { href: "/dashboard/categories", label: "Categories", permission: "catalog.read", icon: "categories" },
      { href: "/dashboard/inventory", label: "Inventory", permission: "inventory.read", icon: "inventory" },
      { href: "/dashboard/size-charts", label: "Size charts", permission: "catalog.read", icon: "sizeCharts" },
      { href: "/dashboard/customers", label: "Customers", permission: "customers.read", icon: "customers" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/dashboard/discounts", label: "Coupons", permission: "marketing.read", icon: "coupons" },
      { href: "/dashboard/marketing/social", label: "Social", permission: "marketing.read", icon: "social" },
      { href: "/dashboard/marketing/inbox", label: "Inbox", permission: "marketing.read", icon: "inbox" },
      { href: "/dashboard/marketing/neural-pulse", label: "Neural Pulse", permission: "marketing.read", icon: "ai" },
      { href: "/dashboard/marketing/google", label: "Google Business", permission: "marketing.read", icon: "gbp" },
      { href: "/dashboard/marketing/creative", label: "Creative studio", permission: "marketing.read", icon: "creative" },
      { href: "/dashboard/reviews", label: "Reviews", permission: "reviews.moderate", icon: "reviews" },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/dashboard/themes", label: "Theme marketplace", permission: "theme.edit", icon: "themes" },
      { href: "/dashboard/theme", label: "Theme editor", permission: "theme.edit", icon: "theme" },
      { href: "/dashboard/media", label: "Media", permission: "store.read", icon: "media" },
      { href: "/dashboard/content/pages", label: "Pages", permission: "content.write", icon: "pages" },
      { href: "/dashboard/content/menus", label: "Menus", permission: "content.write", icon: "menus" },
      { href: "/dashboard/content/blog", label: "Blog", permission: "content.write", icon: "blog" },
      { href: "/dashboard/content/faqs", label: "FAQs", permission: "content.write", icon: "faqs" },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/dashboard/analytics", label: "Analytics", permission: "analytics.read", icon: "analytics" }],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/settings", label: "Settings", permission: "store.read", icon: "settings" },
      { href: "/dashboard/settings/payments", label: "Payments", permission: "payments.manage", icon: "payments" },
      { href: "/dashboard/settings/shipping", label: "Shipping", permission: "store.read", icon: "shipping" },
      { href: "/dashboard/settings/team", label: "Team", permission: "members.read", icon: "team" },
    ],
  },
];
