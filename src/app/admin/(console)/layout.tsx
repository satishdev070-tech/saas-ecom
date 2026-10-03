import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";
import { requirePlatform } from "@/lib/platform/access";
import { adminNavFor } from "@/features/platform/nav";
import { getMyActiveSupportSessions, getPlatformOverview } from "@/features/platform/server/queries";
import { AppShell } from "@/components/app-shell/app-shell";
import { Popover, PopoverItem } from "@/components/app-shell/popover";
import { AppearanceToggle } from "@/components/ui/appearance-toggle";
import { signOutAction } from "@/features/auth/actions";
import { PLATFORM_NAME } from "@/config/platform";
import { brandImageView, getPublicPlatformConfig, platformIconMetadata } from "@/features/platform/server/public-config";

export async function generateMetadata(): Promise<Metadata> {
  return { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false }, ...(await platformIconMetadata()) };
}

const ROLE_LABEL = { super_admin: "Super admin", support: "Support", finance: "Finance" } as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requirePlatform();
  const groups = adminNavFor(ctx.permissions);
  const [sessions, overview, branding] = await Promise.all([
    ctx.permissions.has("platform.support.impersonate") ? getMyActiveSupportSessions(ctx.user.id) : Promise.resolve([]),
    ctx.permissions.has("platform.tenants.read") ? getPlatformOverview().catch(() => null) : Promise.resolve(null),
    getPublicPlatformConfig(),
  ]);
  const logo = brandImageView(branding.headerLogo);
  const icon = brandImageView(branding.favicon);
  const alerts = overview
    ? [
        { key: "trials", label: "trials ending in 7 days", count: overview.trialsEnding7d, href: "/admin/tenants?status=trial" },
        { key: "domains", label: "custom domains awaiting verification", count: overview.customDomainsPending, href: "/admin/domains?status=pending" },
      ].filter((a) => a.count > 0)
    : [];
  const alertTotal = alerts.reduce((s, a) => s + a.count, 0);

  // Logos uploaded in Branding & analytics: favicon as the square mark, header logo for the name.
  const brand = (
    <Link href="/admin" className="flex min-w-0 items-center gap-2.5" aria-label={`${PLATFORM_NAME} platform console`}>
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon.src} alt="" className="size-7 shrink-0 rounded-md object-contain" />
      ) : logo ? null : (
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <ShieldCheck className="size-4" strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.src} alt={PLATFORM_NAME} className="block h-6 w-auto max-w-[150px] object-contain object-left dark:rounded dark:bg-white dark:px-1" />
        ) : (
          <span className="block truncate text-small font-semibold">{PLATFORM_NAME}</span>
        )}
        <span className="block truncate text-caption text-subtle">Platform console</span>
      </span>
    </Link>
  );

  const sidebarFooter = (
    <div className="flex items-center gap-2 px-2 py-1.5 text-caption text-muted">
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      Signed in as {ROLE_LABEL[ctx.role]}
    </div>
  );

  const topbarEnd = (
    <>
      <span className="mr-1 hidden rounded-md bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent sm:inline">Staff</span>
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
          <p className="px-2.5 py-3 text-small text-muted">Nothing needs attention.</p>
        )}
      </Popover>
      <Popover
        label="Account"
        trigger={
          <>
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-surface-secondary text-caption font-semibold ring-1 ring-border">
              {(ctx.user.email ?? "A").slice(0, 1).toUpperCase()}
            </span>
            <ChevronsUpDown aria-hidden className="hidden size-3.5 sm:block" />
          </>
        }
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-small font-medium">{ctx.user.displayName ?? ctx.user.email}</p>
          <p className="truncate text-caption text-muted">{ctx.user.email}</p>
          <p className="mt-1 text-caption text-muted">{ROLE_LABEL[ctx.role]}</p>
        </div>
        <div className="border-t border-border px-2.5 py-2">
          <p className="mb-1.5 text-overline text-subtle">Appearance</p>
          <AppearanceToggle className="w-full justify-between" />
        </div>
        <div className="border-t border-border pt-1.5">
          <form action={signOutAction}>
            <input type="hidden" name="to" value="admin" />
            <PopoverItem>
              <LogOut aria-hidden /> Sign out
            </PopoverItem>
          </form>
        </div>
      </Popover>
    </>
  );

  const banner = sessions.length ? (
    <div role="status" className="border-b border-warning/30 bg-warning/10 px-5 py-2 text-small">
      Active support session{sessions.length > 1 ? "s" : ""}:{" "}
      {sessions.map((s, i) => (
        <span key={s.id}>
          {i ? ", " : ""}
          <Link href={`/admin/tenants/${s.tenantId}/support`} className="font-medium underline">
            {s.tenantName ?? "store"}
          </Link>
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div className="theme-console flex min-h-dvh flex-1">
      <AppShell groups={groups} homeHref="/admin" brand={brand} sidebarFooter={sidebarFooter} topbarEnd={topbarEnd} banner={banner} storageKey="paliya-console-sidebar">
        {children}
      </AppShell>
    </div>
  );
}
