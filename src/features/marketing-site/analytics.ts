/**
 * Analytics-ready markup. CTAs carry declarative data attributes so a tag manager or a
 * future first-party tracker can listen for clicks with one delegated listener, e.g.
 * `document.addEventListener("click", e => e.target.closest("[data-analytics]"))`,
 * without the marketing components knowing which vendor is used.
 */

export type AnalyticsEvent = "cta_click" | "nav_click" | "theme_preview" | "device_preview" | "billing_toggle" | "faq_open";

export type AnalyticsAttributes = {
  "data-analytics": AnalyticsEvent;
  "data-analytics-id": string;
  "data-analytics-location": string;
};

/** Lowercase snake_case token safe for event names/ids ("Start Building" -> "start_building"). */
export function analyticsToken(value: string): string {
  const token = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return token || "unknown";
}

/** Data attributes for a tracked element. */
export function analyticsAttributes(event: AnalyticsEvent, id: string, location: string): AnalyticsAttributes {
  return {
    "data-analytics": event,
    "data-analytics-id": analyticsToken(id),
    "data-analytics-location": analyticsToken(location),
  };
}
