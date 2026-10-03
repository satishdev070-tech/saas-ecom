import type { Metadata } from "next";
import { platformIconMetadata } from "@/features/platform/server/public-config";
import Link from "next/link";
import { Bell, ChevronsUpDown, ExternalLink, LogOut, Store } from "lucide-react";
import { requireTenant } from "@/lib/tenant/membership";
import { DASHBOARD_NAV } from "@/components/dashboard/nav";
import { AppShell } from "@/components/app-shell/app-shell";
import { Popover, PopoverItem } from "@/components/app-shell/popover";
import { AppearanceToggle } from "@/components/ui/appearance-toggle";
import { switchTenantAction } from "@/features/tenants/actions";
import { signOutAction } from "@/features/auth/actions";
import { getDashboardAlerts } from "@/features/dashboard-ui/alerts";
import { storeOrigin, storeSubdomain } from "@/lib/platform/urls";
import { roleLabel } from "@/lib/permissions/labels";

export async function generateMetadata(): Promise<Metadata> {
  return { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false, follow: false }, ...(await platformIconMetadata()) };
}

function Monogram({ name, className = "size-7" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-md bg-primary text-caption font-semibold text-primary-foreground ${className}`}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await requireTenant();
  const groups = DASHBOARD_NAV.map((g) => ({ ...g, items: g.items.filter((i) => ctx.permissions.has(i.permission)) })).filter((g) => g.items.length);
  const storeUrl = storeOrigin(storeSubdomain(ctx.tenantSlug));
  const alerts = await getDashboardAlerts(ctx);
  const alertTotal = alerts.reduce((s, a) => s + a.count, 0);
  const displayName = ctx.user.displayName ?? ctx.user.email ?? "Account";

  const brand = (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
      <Monogram name={ctx.tenantName} />
      <span className="min-w-0">
        <span className="block truncate text-small font-semibold">{ctx.tenantName}</span>
        <span className="block truncate text-caption text-subtle">{ctx.tenantSlug}</span>
      </span>
    </Link>
  );

  const sidebarFooter = (
    <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-2.5 rounded-md px-3 text-small text-muted hover:bg-surface-secondary hover:text-foreground">
      <Store aria-hidden className="size-4" strokeWidth={1.75} />
      <span className="flex-1">View storefront</span>
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  );

  const topbarEnd = (
    <>
      <Popover
        label={alertTotal ? `Notifications, ${alertTotal} need attention` : "Notifications"}
        trigger={
          <span className="relative grid size-5 place-items-center">
            <Bell aria-hidden className="size-4" strokeWidth={1.75} />
            {alertTotal ? <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-accent ring-2 ring-surface" /> : null}
          </span>
        }
      >
        <p className="px-2.5 pb-1 pt-1.5 text-overline text-subtle">Needs attention</p>
        {alerts.length ? (
          alerts.map((a) => (
            <PopoverItem key={a.key} href={a.href}>
              <span className="grid min-w-6 place-items-center rounded bg-accent-soft px-1 text-caption font-semibold text-accent">{a.count}</span>
              <span>{a.label}</span>
            </PopoverItem>
          ))
        ) : (
          <p className="px-2.5 py-3 text-small text-muted">You&apos;re all caught up.</p>
        )}
      </Popover>
      <Popover
        label="Account and store"
        trigger={
          <>
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-surface-secondary text-caption font-semibold text-foreground ring-1 ring-border">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <ChevronsUpDown aria-hidden className="hidden size-3.5 sm:block" />
          </>
        }
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-small font-medium">{displayName}</p>
          <p className="truncate text-caption text-muted">{ctx.user.email}</p>
          <p className="mt-1 text-caption text-muted">
            {roleLabel(ctx.role, ctx.customRoleName)} · {ctx.tenantName}
          </p>
        </div>
        {ctx.memberships.length > 1 ? (
          <div className="border-t border-border pt-1.5">
            <p className="px-2.5 pb-1 text-overline text-subtle">Switch store</p>
            {ctx.memberships.map((m) => (
              <form key={m.tenantId} action={switchTenantAction}>
                <input type="hidden" name="tenantId" value={m.tenantId} />
                <PopoverItem>
                  <Monogram name={m.tenantName} className="size-5 text-[10px]" />
                  <span className="flex-1 truncate">{m.tenantName}</span>
                  {m.tenantId === ctx.tenantId ? <span className="text-caption text-accent">Current</span> : null}
                </PopoverItem>
              </form>
            ))}
          </div>
        ) : null}
        <div className="border-t border-border px-2.5 py-2">
          <p className="mb-1.5 text-overline text-subtle">Appearance</p>
          <AppearanceToggle className="w-full justify-between" />
        </div>
        <div className="border-t border-border pt-1.5">
          <PopoverItem href={storeUrl} external>
            <ExternalLink aria-hidden /> View storefront
          </PopoverItem>
          <form action={signOutAction}>
            <PopoverItem>
              <LogOut aria-hidden /> Sign out
            </PopoverItem>
          </form>
        </div>
      </Popover>
    </>
  );

  const banner =
    ctx.tenantStatus === "suspended" ? (
      <div role="alert" className="border-b border-error/30 bg-error/10 px-5 py-2 text-small text-error">
        This store is suspended and hidden from shoppers. Contact support to restore it.
      </div>
    ) : ctx.tenantStatus === "trial" ? (
      <div className="border-b border-border bg-accent-soft px-5 py-2 text-small text-foreground">
        You&apos;re on a free trial.{" "}
        <Link href="/dashboard/settings" className="font-medium underline underline-offset-2">
          Review store settings
        </Link>
      </div>
    ) : null;

  return (
    <AppShell groups={groups} homeHref="/dashboard" brand={brand} sidebarFooter={sidebarFooter} topbarEnd={topbarEnd} banner={banner} storageKey="paliya-seller-sidebar">
      {children}
    </AppShell>
  );
}
