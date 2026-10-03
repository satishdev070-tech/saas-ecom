"use client";

import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Storefront carousel: native scroll-snap (smooth touch swipe, no scrollbar) with arrow buttons,
 * optional dots and autoplay. One component for the hero slideshow and every product/video row.
 *
 * - variant "hero": one slide per view, arrows on the sides, dots at the bottom, infinite loop, autoplay.
 * - variant "row":  several items per view, arrows on hover (desktop), no dots.
 * Autoplay pauses on hover/focus, when the tab is hidden and for prefers-reduced-motion.
 */
export function Carousel({
  children,
  label,
  variant = "row",
  autoplayMs = 0,
  itemClassName = "",
  className = "",
}: {
  children: ReactNode;
  label: string;
  variant?: "hero" | "row";
  autoplayMs?: number;
  itemClassName?: string;
  className?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const items = Children.toArray(children);
  const count = items.length;
  const [edge, setEdge] = useState({ start: true, end: count <= 1 });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const hero = variant === "hero";
  // Infinite hero: a copy of the last slide before the first and of the first after the last.
  // Landing on a copy jumps (without animation) to the real slide, so next/prev wrap seamlessly.
  const loop = hero && count > 1;
  const slides = loop ? [items[count - 1]!, ...items, items[0]!] : items;

  /** Physical slide index under the viewport. */
  const position = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const first = el.children[0] as HTMLElement | undefined;
    const w = first ? first.getBoundingClientRect().width : el.clientWidth;
    return Math.round(el.scrollLeft / Math.max(1, w));
  }, []);

  const jumpTo = useCallback((index: number, smooth: boolean) => {
    const el = track.current;
    const target = el?.children[index] as HTMLElement | undefined;
    if (!el || !target) return;
    const left = target.offsetLeft - el.offsetLeft;
    if (smooth) {
      el.scrollTo({ left, behavior: "smooth" });
      return;
    }
    el.style.scrollBehavior = "auto";
    el.style.scrollSnapType = "none";
    el.scrollLeft = left;
    requestAnimationFrame(() => {
      el.style.scrollBehavior = "";
      el.style.scrollSnapType = "";
    });
  }, []);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
    const p = position();
    setActive(loop ? (p - 1 + count) % count : Math.min(count - 1, Math.max(0, p)));
  }, [count, loop, position]);

  /** After a scroll settles on a copy, move to the matching real slide. */
  const settle = useCallback(() => {
    if (!loop) return;
    const p = position();
    if (p <= 0) jumpTo(count, false);
    else if (p >= count + 1) jumpTo(1, false);
  }, [loop, count, position, jumpTo]);

  useLayoutEffect(() => {
    if (loop) jumpTo(1, false);
  }, [loop, jumpTo]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    let timer = 0;
    const onScroll = () => {
      update();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 140); // fallback for browsers without "scrollend"
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    const ro = new ResizeObserver(() => {
      update();
      if (loop) jumpTo(Math.min(count, Math.max(1, position())), false);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", settle);
      ro.disconnect();
    };
  }, [update, settle, loop, count, position, jumpTo]);

  const goTo = useCallback((index: number) => jumpTo(loop ? index + 1 : index, true), [loop, jumpTo]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const el = track.current;
      if (!el) return;
      if (loop) {
        // If a previous animation is still sitting on a copy, normalise first so we never run off the end.
        let p = position();
        if (p <= 0) {
          jumpTo(count, false);
          p = count;
        } else if (p >= count + 1) {
          jumpTo(1, false);
          p = 1;
        }
        requestAnimationFrame(() => jumpTo(p + dir, true));
        return;
      }
      el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
    },
    [loop, count, position, jumpTo],
  );

  // Autoplay (hero): respects hover/focus, hidden tabs and reduced motion.
  useEffect(() => {
    if (!autoplayMs || count < 2 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") step(1);
    }, autoplayMs);
    return () => window.clearInterval(t);
  }, [autoplayMs, count, paused, step]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  };

  if (count === 0) return null;
  const showArrows = count > 1;

  return (
    <div
      className={`sf-carousel group/carousel relative ${hero ? "sf-carousel-hero" : ""} ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={onKey}
    >
      <ul ref={track} className={`sf-carousel-track ${hero ? "" : "gap-3 @[48rem]:gap-5"}`} tabIndex={0} aria-live={autoplayMs && !paused ? "off" : "polite"}>
        {slides.map((child, i) => {
          const clone = loop && (i === 0 || i === slides.length - 1);
          const n = loop ? ((i - 1 + count) % count) + 1 : i + 1;
          return (
            <li
              key={clone ? `clone-${i}` : i}
              className={`sf-carousel-item ${hero ? "w-full" : itemClassName}`}
              aria-roledescription={clone ? undefined : "slide"}
              aria-label={clone ? undefined : `${n} of ${count}`}
              aria-hidden={clone || undefined}
              inert={clone || undefined}
            >
              {child}
            </li>
          );
        })}
      </ul>

      {showArrows ? (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!hero && edge.start}
            aria-label={hero ? "Previous slide" : "Scroll left"}
            className={`sf-carousel-btn left-2 @[64rem]:left-4 ${hero ? "" : "sf-carousel-btn-row -translate-x-1/3"}`}
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!hero && edge.end}
            aria-label={hero ? "Next slide" : "Scroll right"}
            className={`sf-carousel-btn right-2 @[64rem]:right-4 ${hero ? "" : "sf-carousel-btn-row translate-x-1/3"}`}
          >
            <Chevron dir="right" />
          </button>
        </>
      ) : null}

      {hero && count > 1 ? (
        <div className="sf-carousel-dots" role="tablist" aria-label="Choose slide">
          {items.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Slide ${i + 1}`} onClick={() => goTo(i)} className={`sf-carousel-dot ${i === active ? "is-active" : ""}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}
