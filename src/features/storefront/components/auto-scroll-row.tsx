"use client";

import { Children, useCallback, useEffect, useRef, type ReactNode } from "react";

/**
 * Continuous marquee row (opt-in: ProductCarousel `autoScroll`). The items are rendered twice
 * (the copy is aria-hidden and not focusable) and a requestAnimationFrame loop advances the native
 * scroll position, wrapping by one set's width, so the row loops seamlessly while staying a real
 * scroller: touch swipe, mouse drag and the arrow buttons all keep working.
 *
 * Pauses on hover, keyboard focus, touch and drag, and while the tab is hidden. With
 * prefers-reduced-motion there is no auto-scroll at all (arrows and drag still work).
 */
export function AutoScrollRow({ children, label, itemClassName = "", pxPerSecond = 34 }: { children: ReactNode; label: string; itemClassName?: string; pxPerSecond?: number }) {
  const scroller = useRef<HTMLUListElement>(null);
  const items = Children.toArray(children);
  const count = items.length;
  /** Reasons the motion is paused (hover, focus, touch, drag, arrow). */
  const holds = useRef(new Set<string>());
  const pos = useRef(0);
  const period = useRef(0);
  const resumeTimer = useRef(0);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    const copy = el.children[count] as HTMLElement | undefined;
    period.current = first && copy ? copy.offsetLeft - first.offsetLeft : 0;
  }, [count]);

  /** Keep the scroll position inside [0, period) so either direction loops forever. */
  const wrap = useCallback(() => {
    const el = scroller.current;
    const p = period.current;
    if (!el || p <= 0) return;
    if (el.scrollLeft >= p) el.scrollLeft -= p;
    else if (el.scrollLeft <= 0) el.scrollLeft += p;
  }, []);

  const hold = useCallback((reason: string, on: boolean) => {
    if (on) holds.current.add(reason);
    else holds.current.delete(reason);
    if (!on && scroller.current) pos.current = scroller.current.scrollLeft;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el || count < 2) return;
    // The duplicate set must not add tab stops.
    el.querySelectorAll<HTMLElement>("[data-copy] a, [data-copy] button").forEach((n) => n.setAttribute("tabindex", "-1"));
    measure();
    pos.current = el.scrollLeft;
    const ro = new ResizeObserver(() => {
      measure();
      wrap();
      pos.current = el.scrollLeft;
    });
    ro.observe(el);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 0;
      last = t;
      const p = period.current;
      if (p > 0 && !holds.current.size && !reduced?.matches && document.visibilityState === "visible") {
        pos.current += (pxPerSecond * dt) / 1000;
        if (pos.current >= p) pos.current -= p;
        el.scrollLeft = pos.current;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onScroll = () => {
      if (holds.current.size) wrap();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(resumeTimer.current);
    };
  }, [count, measure, wrap, pxPerSecond]);

  // Mouse drag (touch uses native scrolling). A drag suppresses the click that follows it.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false };
    hold("drag", true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.left - dx;
    if (el.scrollLeft >= period.current || el.scrollLeft <= 0) {
      wrap();
      d.left = el.scrollLeft + dx;
    }
  };
  const endDrag = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    hold("drag", false);
    if (moved) {
      const stop = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      window.addEventListener("click", stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 50);
    }
  };

  const step = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    wrap();
    const card = el.children[0] as HTMLElement | undefined;
    const w = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.3;
    hold("arrow", true);
    el.scrollBy({ left: dir * w, behavior: "smooth" });
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      wrap();
      hold("arrow", false);
    }, 700);
  };

  if (count === 0) return null;
  return (
    <div
      className="sf-carousel sf-autoscroll relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => hold("hover", true)}
      onMouseLeave={() => {
        hold("hover", false);
        endDrag();
      }}
      onFocusCapture={() => hold("focus", true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold("focus", false);
      }}
      onTouchStart={() => {
        window.clearTimeout(resumeTimer.current);
        hold("touch", true);
      }}
      onTouchEnd={() => {
        window.clearTimeout(resumeTimer.current);
        resumeTimer.current = window.setTimeout(() => hold("touch", false), 2500);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          step(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <ul
        ref={scroller}
        className="sf-autoscroll-track gap-3 @[48rem]:gap-5"
        tabIndex={0}
        aria-live="off"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(e) => e.preventDefault()}
      >
        {items.map((child, i) => (
          <li key={i} className={`sf-carousel-item ${itemClassName}`} aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
            {child}
          </li>
        ))}
        {count > 1
          ? items.map((child, i) => (
              <li key={`copy-${i}`} className={`sf-carousel-item ${itemClassName}`} aria-hidden data-copy="">
                {child}
              </li>
            ))
          : null}
      </ul>
      {count > 1 ? (
        <>
          <button type="button" onClick={() => step(-1)} aria-label="Scroll left" className="sf-carousel-btn sf-carousel-btn-row left-2 @[64rem]:left-4">
            <Chevron dir="left" />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Scroll right" className="sf-carousel-btn sf-carousel-btn-row right-2 @[64rem]:right-4">
            <Chevron dir="right" />
          </button>
        </>
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
