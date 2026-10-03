"use client";

/** Shown if the theme list fails to render; the rest of the site keeps working. */
export default function ThemesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6" role="alert">
      <h1 className="font-brand text-2xl font-bold text-brand-ink">We couldn&apos;t load the themes</h1>
      <p className="mt-3 text-muted">Please try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-6 h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Try again
      </button>
    </div>
  );
}
