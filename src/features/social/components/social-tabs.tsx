"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const BASE = "/dashboard/marketing/social";
const TABS = [
  ["", "Overview"],
  ["/calendar", "Calendar"],
  ["/posts", "Posts"],
  ["/accounts", "Accounts"],
  ["/library", "Library"],
] as const;

export function SocialTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Social" className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.map(([href, label]) => {
          const full = `${BASE}${href}`;
          const active = href === "" ? pathname === BASE : pathname.startsWith(full);
          return (
            <li key={href}>
              <Link
                href={full}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-small font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent",
                  active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
