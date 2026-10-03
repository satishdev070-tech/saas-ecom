/** Shown to visitors while a store is a private draft (not yet published by its owner). */
export function ComingSoon({ storeName }: { storeName: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Coming soon</p>
      <h1 className="font-display text-3xl">{storeName}</h1>
      <p className="text-muted">This store is getting ready to open. Please check back soon.</p>
    </main>
  );
}
