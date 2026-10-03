import Link from "next/link";
import { breadcrumbJsonLd, jsonLdString, type BreadcrumbItem } from "@/features/storefront/seo";

/** Visible breadcrumb trail + BreadcrumbList JSON-LD. Last item is the current page. */
export function Breadcrumbs({ items, primaryHost }: { items: BreadcrumbItem[]; primaryHost: string }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="sf-muted text-xs">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((it, i) => (
            <li key={it.path} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {i === items.length - 1 ? (
                <span aria-current="page" className="text-[var(--sf-text)]">
                  {it.name}
                </span>
              ) : (
                <Link href={it.path} className="sf-link-quiet">
                  {it.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(primaryHost, items)) }} />
    </>
  );
}
