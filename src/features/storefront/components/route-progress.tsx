"use client";

import { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import "./loader.css";

/**
 * Thin top progress bar for client-side navigations on every storefront, in the theme accent
 * colour. Starts when an internal link is clicked (or on back/forward), finishes when the URL
 * the app renders changes. Shown only after a short delay so instant (prefetched) navigations
 * don't flash it; fixed-position transform only, so it never shifts layout or delays the first
 * render (it renders nothing visible until a navigation starts).
 */
export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

const SHOW_DELAY_MS = 120;
const GIVE_UP_MS = 12_000;

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const bar = useRef<HTMLDivElement>(null);
  const api = useRef<{ done: (force?: boolean) => void } | null>(null);
  const state = useRef<{ show?: number; trickle?: number; giveUp?: number; hide?: number; wait?: number; value: number; active: boolean }>({ value: 0, active: false });

  useEffect(() => {
    const el = bar.current;
    const fill = el?.firstElementChild as HTMLElement | null;
    if (!el || !fill) return;
    const s = state.current;
    const set = (v: number) => {
      s.value = v;
      fill.style.transform = `scaleX(${v})`;
    };
    const clear = () => {
      window.clearTimeout(s.show);
      window.clearInterval(s.trickle);
      window.clearTimeout(s.giveUp);
      window.clearTimeout(s.hide);
      window.clearTimeout(s.wait);
    };
    const start = () => {
      clear();
      s.active = true;
      s.show = window.setTimeout(() => {
        el.dataset.state = "loading";
        set(0.12);
        // Ease towards 90% while waiting; the real finish jumps to 100%.
        s.trickle = window.setInterval(() => set(s.value + (0.9 - s.value) * 0.12), 300);
      }, SHOW_DELAY_MS);
      s.giveUp = window.setTimeout(() => done(true), GIVE_UP_MS);
    };
    const done = (force = false) => {
      if (!s.active) return;
      // With a prefetched loading.tsx the URL commits at once and a skeleton streams in: keep the
      // bar running until the real page replaces the skeleton.
      if (!force && document.querySelector(".sf-loading")) {
        window.clearTimeout(s.wait);
        s.wait = window.setTimeout(done, 150);
        return;
      }
      s.active = false;
      const wasShown = el.dataset.state === "loading";
      clear();
      if (!wasShown) return;
      set(1);
      el.dataset.state = "done";
      s.hide = window.setTimeout(() => set(0), 350);
    };
    api.current = { done };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // Same page (or only the #hash changes): no navigation to wait for.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    const onPop = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clear();
    };
  }, []);

  // The rendered URL changed: the navigation committed.
  useEffect(() => {
    api.current?.done();
  }, [pathname, search]);

  return (
    <div ref={bar} className="sf-progress" aria-hidden>
      <span />
    </div>
  );
}

/**
 * Store name for the loading skeleton, read from the header logo link that the layout already
 * rendered (aria-label "<Store> home"), so loading.tsx needs no data fetch. Empty on the server
 * and before hydration; the slot has a fixed height, so filling it causes no layout shift.
 */
export function LoaderBrand() {
  const name = useSyncExternalStore(
    noopSubscribe,
    () => document.querySelector<HTMLAnchorElement>('[data-sf-root] a[aria-label$=" home"]')?.getAttribute("aria-label")?.replace(/ home$/, "") ?? "",
    () => "",
  );
  return (
    <p aria-hidden className="sf-skel-brand flex h-6 items-center justify-center text-xs">
      {name}
    </p>
  );
}

const noopSubscribe = () => () => {};
