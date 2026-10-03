"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, CornerDownLeft, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavGroup, NavItem } from "@/components/dashboard/nav";
import { NAV_ICONS, NAV_ICON_STROKE } from "./icons";

type Props = {
  groups: NavGroup[];
  /** Root of this console ("/dashboard" or "/admin"): only active on itself. */
  homeHref: string;
  brand: ReactNode;
  sidebarFooter: ReactNode;
  topbarEnd: ReactNode;
  banner?: ReactNode;
  storageKey: string;
  children: ReactNode;
};

function isActive(pathname: string, href: string, homeHref: string) {
  return href === homeHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

const SEGMENT_LABELS: Record<string, string> = { new: "New", edit: "Edit", import: "Import", export: "Export", support: "Support" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useBreadcrumbs(pathname: string, groups: NavGroup[], homeHref: string) {
  return useMemo(() => {
    const flat = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
    const match = flat.filter((i) => isActive(pathname, i.href, homeHref) || (i.href !== homeHref && pathname.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
    if (!match) return [] as { label: string; href?: string }[];
    const crumbs: { label: string; href?: string }[] = [];
    if (match.href !== homeHref) crumbs.push({ label: match.group });
    crumbs.push({ label: match.label, href: pathname === match.href ? undefined : match.href });
    const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
    rest.forEach((seg, i) => {
      const label = SEGMENT_LABELS[seg] ?? (UUID.test(seg) ? "Details" : seg.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
      crumbs.push({ label, href: i === rest.length - 1 ? undefined : `${match.href}/${rest.slice(0, i + 1).join("/")}` });
    });
    return crumbs;
  }, [pathname, groups, homeHref]);
}

function NavList({ groups, collapsed, homeHref, onNavigate }: { groups: NavGroup[]; collapsed: boolean; homeHref: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          {collapsed ? <div aria-hidden className="mx-3 mb-2 border-t border-border first:hidden" /> : <p className="mb-1 px-3 text-overline text-subtle">{g.label}</p>}
          {collapsed ? <p className="sr-only">{g.label}</p> : null}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(pathname, item.href, homeHref)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavRow({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <li className="group/nav relative">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-md px-3 text-small transition-colors",
          collapsed && "justify-center px-0",
          active ? "bg-surface-secondary font-medium text-foreground" : "text-muted hover:bg-surface-secondary hover:text-foreground",
        )}
      >
        <Icon aria-hidden strokeWidth={NAV_ICON_STROKE} className={cn("size-4 shrink-0", active ? "text-accent" : "")} />
        <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      </Link>
      {collapsed ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-caption font-medium text-primary-foreground shadow-md group-focus-within/nav:block group-hover/nav:block"
        >
          {item.label}
        </span>
      ) : null}
    </li>
  );
}

/** ⌘K / Ctrl+K quick jump to any module the member can access. */
function CommandSearch({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const items = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), [groups]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.label.toLowerCase().includes(t) || i.group.toLowerCase().includes(t)) : items;
  }, [q, items]);
  const open = useCallback(() => {
    setQ("");
    setCursor(0);
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const go = (href: string) => {
    dialog.current?.close();
    router.push(href);
  };
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-surface-secondary/60 px-2.5 text-small text-subtle transition-colors hover:border-border-strong md:flex"
      >
        <Search aria-hidden className="size-4" strokeWidth={NAV_ICON_STROKE} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 text-caption text-muted">⌘K</kbd>
      </button>
      <button type="button" onClick={open} aria-label="Search" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary md:hidden">
        <Search aria-hidden className="size-4" strokeWidth={NAV_ICON_STROKE} />
      </button>
      <dialog
        ref={dialog}
        aria-label="Search"
        className="m-auto mt-[12vh] w-[min(92vw,560px)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/40"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && results[cursor]) {
                e.preventDefault();
                go(results[cursor].href);
              }
            }}
            placeholder="Jump to…"
            aria-label="Search pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-results"
            aria-activedescendant={results[cursor] ? `cmd-${results[cursor].href}` : undefined}
            className="h-12 flex-1 bg-transparent text-body outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-border px-1.5 text-caption text-muted">Esc</kbd>
        </div>
        <ul id="cmd-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length ? (
            results.map((r, i) => {
              const Icon = NAV_ICONS[r.icon];
              return (
                <li key={r.href} id={`cmd-${r.href}`} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r.href)}
                    className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-small", i === cursor ? "bg-surface-secondary" : "")}
                  >
                    <Icon aria-hidden className="size-4 text-muted" strokeWidth={NAV_ICON_STROKE} />
                    <span className="flex-1">{r.label}</span>
                    <span className="text-caption text-subtle">{r.group}</span>
                    {i === cursor ? <CornerDownLeft aria-hidden className="size-3.5 text-subtle" /> : null}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-6 text-center text-small text-muted">No matches for “{q}”</li>
          )}
        </ul>
      </dialog>
    </>
  );
}

export function AppShell({ groups, homeHref, brand, sidebarFooter, topbarEnd, banner, storageKey, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const crumbs = useBreadcrumbs(pathname, groups, homeHref);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  return (
    <div className="flex min-h-dvh flex-1 bg-background">
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-60")}>
        <div className={cn("flex h-14 shrink-0 items-center border-b border-border", collapsed ? "justify-center" : "justify-between px-3")}>
          {collapsed ? null : <div className="min-w-0 flex-1">{brand}</div>}
          <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary hover:text-foreground">
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4" strokeWidth={NAV_ICON_STROKE} /> : <PanelLeftClose aria-hidden className="size-4" strokeWidth={NAV_ICON_STROKE} />}
          </button>
        </div>
        <div className={cn("flex-1 py-4", collapsed ? "overflow-visible px-2" : "overflow-y-auto px-2")}>
          <NavList groups={groups} collapsed={collapsed} homeHref={homeHref} />
        </div>
        <div className={cn("shrink-0 border-t border-border p-2", collapsed && "hidden")}>{sidebarFooter}</div>
      </aside>

      <dialog
        ref={drawer}
        aria-label="Navigation"
        className="m-0 h-dvh max-h-none w-[min(86vw,300px)] max-w-none border-0 border-r border-border bg-surface p-0 text-foreground backdrop:bg-black/40 open:animate-[shell-in_200ms_ease-out]"
        onClick={(e) => e.target === drawer.current && drawer.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-between border-b border-border px-3">
            <div className="min-w-0 flex-1">{brand}</div>
            <button type="button" onClick={() => drawer.current?.close()} aria-label="Close navigation" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-4">
            <NavList groups={groups} collapsed={false} homeHref={homeHref} onNavigate={() => drawer.current?.close()} />
          </div>
          <div className="border-t border-border p-2">{sidebarFooter}</div>
        </div>
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:px-5">
          <button type="button" onClick={() => drawer.current?.showModal()} aria-label="Open navigation" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary lg:hidden">
            <MenuIcon aria-hidden className="size-5" strokeWidth={NAV_ICON_STROKE} />
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5 text-small">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className={cn("flex min-w-0 items-center gap-1.5", i < crumbs.length - 2 && "hidden sm:flex")}>
                  {i > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-subtle" /> : null}
                  {c.href ? (
                    <Link href={c.href} className="truncate text-muted hover:text-foreground">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={cn("truncate", i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted")}>
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <CommandSearch groups={groups} />
          <div className="flex items-center gap-1">{topbarEnd}</div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 has-[[data-full-width]]:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
