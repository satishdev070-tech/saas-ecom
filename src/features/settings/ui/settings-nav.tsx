"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type SettingsNavGroup = { label: string; items: { href: string; label: string }[] };

/** Settings centre navigation: vertical list on desktop, horizontal scroller on phones. */
export function SettingsNav({ groups }: { groups: SettingsNavGroup[] }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/dashboard/settings" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex gap-1 lg:flex-col lg:gap-5">
        {groups.map((g) => (
          <div key={g.label} className="flex gap-1 lg:flex-col lg:gap-0.5">
            <p className="hidden px-3 pb-1 text-caption font-medium text-muted lg:block">{g.label}</p>
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-small whitespace-nowrap", active(i.href) ? "bg-accent-soft font-medium text-accent" : "text-foreground hover:bg-surface-secondary")}
              >
                {i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
