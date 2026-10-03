import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";

const TABS = [
  ["pages", "Pages"],
  ["blog", "Blog"],
  ["menus", "Navigation"],
  ["faqs", "FAQs"],
  ["locations", "Store locations"],
  ["redirects", "Redirects"],
] as const;

export default async function ContentLayout({ children }: LayoutProps<"/dashboard/content">) {
  await requireTenantPermission("content.write");
  return (
    <div>
      <nav aria-label="Content" className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3 text-sm">
        {TABS.map(([href, label]) => (
          <Link key={href} href={`/dashboard/content/${href}`} className="rounded-md px-3 py-1.5 hover:bg-surface">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
