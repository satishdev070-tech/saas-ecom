"use client";

import { useState, type ReactNode } from "react";
import { Play } from "lucide-react";

/**
 * Shows `still` (screenshot or mockup) until the visitor asks for the live demo. Live demo stores
 * load many product images, so they are only fetched on request, never for every page view.
 */
export function ClickToLive({ still, live, label }: { still: ReactNode; live: ReactNode; label: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="relative">
      {on ? live : still}
      {!on ? (
        <button
          type="button"
          onClick={() => setOn(true)}
          className="absolute left-1/2 top-[42%] inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-brand-ink/90 px-4 py-2 text-sm font-semibold text-white shadow-brand-float backdrop-blur hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Play aria-hidden className="size-4 fill-current" /> {label}
        </button>
      ) : null}
    </div>
  );
}
