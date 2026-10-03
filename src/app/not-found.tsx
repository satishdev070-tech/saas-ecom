import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * Shared 404 for unknown paths, unknown/unverified hosts and cancelled stores.
 * Deliberately generic: it must not reveal whether a hostname belongs to a tenant.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted">404</p>
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="text-muted">The page you are looking for doesn&apos;t exist or is no longer available.</p>
    </main>
  );
}
