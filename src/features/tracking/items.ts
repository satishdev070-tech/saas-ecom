/**
 * Pure analytics helpers shared by the browser tag layer, server components and tests.
 * Event names follow GA4's recommended e-commerce events; Meta Pixel receives the mapped
 * standard events. Items carry public catalogue data only (no personal data).
 */

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_category?: string;
  item_list_name?: string;
  index?: number;
  /** rupees (GA4 expects major units) */
  price: number;
  quantity: number;
};

export type EcommerceEvent =
  | "page_view"
  | "view_item"
  | "view_item_list"
  | "search"
  | "select_item"
  | "add_to_wishlist"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  | "begin_checkout"
  | "add_shipping_info"
  | "add_payment_info"
  | "purchase"
  | "login"
  | "sign_up";

export type EventParams = {
  currency?: "INR";
  value?: number;
  items?: AnalyticsItem[];
  transaction_id?: string;
  shipping?: number;
  tax?: number;
  coupon?: string;
  search_term?: string;
  item_list_name?: string;
  payment_type?: string;
  shipping_tier?: string;
  method?: string;
};

/** GA4 event → Meta Pixel standard event (null = not sent to Meta). */
export const META_EVENT: Record<EcommerceEvent, string | null> = {
  page_view: null, // PageView is sent by the pixel on each navigation
  view_item: "ViewContent",
  view_item_list: null,
  search: "Search",
  select_item: null,
  add_to_wishlist: "AddToWishlist",
  add_to_cart: "AddToCart",
  remove_from_cart: null,
  view_cart: null,
  begin_checkout: "InitiateCheckout",
  add_shipping_info: null,
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  login: null,
  sign_up: "CompleteRegistration",
};

/** Meta Pixel parameters for a GA4-style payload. */
export function toMetaParams(p: EventParams): Record<string, unknown> {
  const items = p.items ?? [];
  return {
    ...(p.value !== undefined ? { value: p.value, currency: p.currency ?? "INR" } : {}),
    ...(items.length ? { content_ids: items.map((i) => i.item_id), content_type: "product", contents: items.map((i) => ({ id: i.item_id, quantity: i.quantity })), num_items: items.reduce((s, i) => s + i.quantity, 0) } : {}),
    ...(items.length === 1 ? { content_name: items[0]!.item_name } : {}),
    ...(p.search_term ? { search_string: p.search_term } : {}),
  };
}

export const itemsValue = (items: AnalyticsItem[]) => Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;

// ------------------------------------------------------------------ campaign attribution

export const ATTRIBUTION_COOKIE = "pl_attr";
export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;
export type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>> & { landing_path?: string; first_seen?: string };

const clean = (v: unknown, max = 150) => (typeof v === "string" ? v.replace(/[^\w\-.~:/+@ ]/g, "").trim().slice(0, max) : "");

/** Campaign params from a URL's search params, or null when there are none. */
export function attributionFromSearch(search: URLSearchParams, path: string, now = new Date()): Attribution | null {
  const out: Attribution = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = clean(search.get(k), k === "gclid" || k === "fbclid" ? 300 : 150);
    if (v) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  out.landing_path = clean(path, 200) || "/";
  out.first_seen = now.toISOString();
  return out;
}

/** Validates an attribution cookie value (untrusted input) before it is stored on an order. */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw || raw.length > 2000) return null;
  let json: unknown;
  try {
    json = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const src = json as Record<string, unknown>;
  const out: Attribution = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = clean(src[k], k === "gclid" || k === "fbclid" ? 300 : 150);
    if (v) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  const lp = clean(src.landing_path, 200);
  if (lp.startsWith("/")) out.landing_path = lp;
  if (typeof src.first_seen === "string" && !Number.isNaN(Date.parse(src.first_seen))) out.first_seen = new Date(src.first_seen).toISOString();
  return out;
}
