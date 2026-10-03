/** Controlled state for suspended tenants: no catalog data is queried or shown. */
export function StoreUnavailable({ storeName }: { storeName: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <h1 className="font-display text-3xl">{storeName}</h1>
      <p className="text-muted">This store is temporarily unavailable. Please check back soon.</p>
    </main>
  );
}
