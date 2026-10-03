"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Real device viewports the demo store is rendered at, then scaled down to fit the frame. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * A live, scaled demo store. The store is rendered at a true device width (so the phone frame
 * shows the store's real mobile layout, not a shrunk desktop page), scaled to the frame's width.
 * The iframe only mounts once the frame nears the viewport, and `fallback` (the token mockup)
 * stays visible until the page has loaded, or for good if it never does.
 */
export function LiveFrame({ src, viewport, fallback, eager = false }: { src: string; viewport: { width: number; height: number }; fallback: ReactNode; eager?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(eager);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / viewport.width);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    let seen: IntersectionObserver | undefined;
    if (!eager) {
      seen = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setVisible(true);
            seen?.disconnect();
          }
        },
        { rootMargin: "300px" },
      );
      seen.observe(element);
    }
    return () => {
      resize.disconnect();
      seen?.disconnect();
    };
  }, [eager, viewport.width]);

  return (
    <div ref={frame} className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}>
      <div className={`absolute inset-0 transition-opacity duration-300 ${loaded ? "opacity-0" : "opacity-100"}`}>{fallback}</div>
      {visible && scale ? (
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          loading={eager ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)}
          className={`pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }}
        />
      ) : null}
    </div>
  );
}
