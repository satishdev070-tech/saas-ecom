import Link from "next/link";

/** Server-rendered pagination using ?page=. Keeps other query params. */
export function Pagination({ page, pageSize, total, basePath, params = {} }: { page: number; pageSize: number; total: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <p className="text-muted">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface" href={href(page - 1)} rel="prev">
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface" href={href(page + 1)} rel="next">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
