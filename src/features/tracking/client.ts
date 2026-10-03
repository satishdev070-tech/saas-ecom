"use client";

import { META_EVENT, toMetaParams, type EcommerceEvent, type EventParams } from "./items";

/**
 * Browser event layer. No-ops unless the store enabled a tag (TrackingTags sets window.__pl).
 * gtag() and fbq() queue calls until their scripts load, so events never get lost on first paint.
 */
type Gtag = (...args: unknown[]) => void;
type PlConfig = { ga4: string | null; ads: { id: string; label: string } | null; pixel: string | null };
declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Gtag;
    __pl?: PlConfig;
  }
}

export function track(name: EcommerceEvent, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  const cfg = window.__pl;
  if (!cfg) return;
  const payload: EventParams = params.value !== undefined || params.items ? { currency: "INR", ...params } : params;
  try {
    if ((cfg.ga4 || cfg.ads) && window.gtag) window.gtag("event", name, payload);
    if (name === "purchase" && cfg.ads && window.gtag) {
      window.gtag("event", "conversion", { send_to: `${cfg.ads.id}/${cfg.ads.label}`, value: params.value, currency: "INR", transaction_id: params.transaction_id });
    }
    const meta = META_EVENT[name];
    if (meta && cfg.pixel && window.fbq) {
      const opts = name === "purchase" && params.transaction_id ? { eventID: `purchase_${params.transaction_id}` } : undefined;
      window.fbq("track", meta, toMetaParams(payload), opts);
    }
  } catch {
    // Analytics must never break the storefront.
  }
}

/** Fires an event once per browser session for a given key (e.g. purchase per order). */
export function trackOnce(key: string, name: EcommerceEvent, params: EventParams = {}) {
  try {
    const k = `pl_ev_${key}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch {
    // sessionStorage unavailable: fall through and send (duplicates are deduped by transaction_id in GA4).
  }
  track(name, params);
}
