/** Skeleton while the theme list renders. */
export default function ThemesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6" role="status" aria-label="Loading themes">
      <div className="h-10 w-72 animate-pulse rounded-full bg-brand-canvas" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-brand-lg bg-brand-canvas" />
        ))}
      </div>
    </div>
  );
}
