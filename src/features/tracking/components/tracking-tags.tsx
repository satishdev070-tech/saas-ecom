"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ATTRIBUTION_COOKIE, attributionFromSearch, type AnalyticsItem } from "../items";
import { track } from "../client";

export type TrackingConfig = { ga4: string | null; ads: { id: string; label: string } | null; pixel: string | null };

const ID_RE = /^[A-Za-z0-9-]{4,30}$/;

/** First-touch campaign cookie (30 days). Holds campaign parameters only, no personal data. */
function captureAttribution(search: URLSearchParams, path: string) {
  const attr = attributionFromSearch(search, path);
  if (!attr) return;
  if (document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))) return;
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(attr))}; Max-Age=${30 * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

/**
 * Loads the store's enabled tags (GA4 / Google Ads via one gtag.js, Meta Pixel) and records
 * campaign attribution. Rendered only for stores with at least one enabled tag, never in preview.
 * Honours Global Privacy Control / Do Not Track by not loading any tag.
 */
export function TrackingTags({ config }: { config: TrackingConfig }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const first = useRef(true);
  const optedOut = typeof navigator !== "undefined" && ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === "1");

  useEffect(() => {
    captureAttribution(new URLSearchParams(search.toString()), pathname);
    // login / sign_up flagged by a server action before its redirect.
    const flag = document.cookie.split("; ").find((c) => c.startsWith("pl_ev="));
    if (flag) {
      document.cookie = "pl_ev=; Max-Age=0; Path=/";
      const [name, method] = decodeURIComponent(flag.slice(6)).split(":");
      if (name === "login" || name === "sign_up") window.setTimeout(() => track(name, { method: method?.slice(0, 20) }), 50);
    }
  }, [pathname, search]);

  // Meta PageView on client-side navigations (the base code sends the first one).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (config.pixel && window.fbq && !optedOut) window.fbq("track", "PageView");
  }, [pathname, config.pixel, optedOut]);

  // select_item for product links rendered by server components (data-track-item='{…}').
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-track-item]");
      if (!el) return;
      try {
        const item = JSON.parse(el.getAttribute("data-track-item") ?? "") as AnalyticsItem;
        track("select_item", { item_list_name: item.item_list_name, items: [item] });
      } catch {
        // ignore malformed payloads
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  if (optedOut) return null;
  const ga4 = config.ga4 && ID_RE.test(config.ga4) ? config.ga4 : null;
  const ads = config.ads && ID_RE.test(config.ads.id) && /^[A-Za-z0-9_-]{4,40}$/.test(config.ads.label) ? config.ads : null;
  const pixel = config.pixel && /^\d{10,20}$/.test(config.pixel) ? config.pixel : null;
  const gtagId = ga4 ?? ads?.id ?? null;
  const cfg = JSON.stringify({ ga4, ads, pixel });

  return (
    <>
      <Script id="pl-cfg" strategy="afterInteractive">{`window.__pl=${cfg};`}</Script>
      {gtagId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="pl-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${ga4 ? `gtag('config',${JSON.stringify(ga4)});` : ""}${ads ? `gtag('config',${JSON.stringify(ads.id)});` : ""}`}
          </Script>
        </>
      ) : null}
      {pixel ? (
        <Script id="pl-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixel)});fbq('track','PageView');`}
        </Script>
      ) : null}
    </>
  );
}
