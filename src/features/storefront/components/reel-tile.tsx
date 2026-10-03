"use client";

import { useEffect, useRef } from "react";

/** Muted, looping reel preview that only plays while visible. */
export function ReelVideo({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? el.play().catch(() => undefined) : el.pause()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster ?? undefined} muted loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" aria-hidden />;
}
