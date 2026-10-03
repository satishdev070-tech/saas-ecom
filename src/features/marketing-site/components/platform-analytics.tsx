"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const ID_RE = /^G-[A-Z0-9]{4,20}$/;

/**
 * Google tag (GA4) for the platform's own marketing pages, configured in /admin/branding.
 * Not loaded for visitors with Global Privacy Control or Do Not Track. Sends page_view on
 * client-side navigations and the `data-analytics` CTA clicks as GA4 events.
 */
export function PlatformAnalytics({ id }: { id: string }) {
  const pathname = usePathname();
  const first = useRef(true);
  const optedOut = typeof navigator !== "undefined" && ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === "1");
  const valid = ID_RE.test(id) && !optedOut;

  useEffect(() => {
    if (!valid) return;
    if (first.current) {
      first.current = false;
      return;
    }
    window.gtag?.("event", "page_view", { page_path: pathname, page_location: window.location.href });
  }, [pathname, valid]);

  useEffect(() => {
    if (!valid) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-analytics]");
      if (!el) return;
      window.gtag?.("event", el.getAttribute("data-analytics") ?? "cta_click", { cta_id: el.getAttribute("data-analytics-id"), cta_location: el.getAttribute("data-analytics-location") });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [valid]);

  if (!valid) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="platform-gtag" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(id)});`}</Script>
    </>
  );
}
