/**
 * Pure Google Business Profile helpers (unit tested). Shapes follow the official API reference:
 *   Reviews  — v4 accounts.locations.reviews (starRating ONE..FIVE, reviewReply { comment, updateTime }).
 *   Posts    — v4 accounts.locations.localPosts (topicType STANDARD, callToAction LEARN_MORE, media PHOTO).
 *   Location — Business Information API v1 (title, phoneNumbers, storefrontAddress, regularHours,
 *              profile.description, categories, websiteUri, metadata.placeId).
 */

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
/** Google's limits: post text 1,500 characters, business description 750 characters, reply 4,096 bytes. */
export const POST_SUMMARY_MAX = 1500;
export const DESCRIPTION_MAX = 750;
export const REPLY_MAX_BYTES = 4096;

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type ParsedReview = {
  reviewId: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
  reply: string | null;
  repliedAt: string | null;
  reviewTime: string | null;
};

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const time = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** One v4 Review → our row. Returns null when the review has no id. Anonymous reviewers have no name. */
export function parseReview(raw: unknown): ParsedReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const reviewId = str(r.reviewId, 300) ?? (typeof r.name === "string" ? str(r.name.split("/reviews/")[1], 300) : null);
  if (!reviewId) return null;
  const reviewer = (r.reviewer ?? {}) as Record<string, unknown>;
  const reply = (r.reviewReply ?? null) as Record<string, unknown> | null;
  return {
    reviewId,
    reviewerName: reviewer.isAnonymous === true ? null : str(reviewer.displayName, 200),
    starRating: typeof r.starRating === "string" ? (STARS[r.starRating] ?? null) : null,
    comment: str(r.comment, 5000),
    reply: reply ? str(reply.comment, 4096) : null,
    repliedAt: reply ? time(reply.updateTime) : null,
    reviewTime: time(r.createTime) ?? time(r.updateTime),
  };
}

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export type ReviewStats = { count: number; average: number | null; unreplied: number; byStar: Record<1 | 2 | 3 | 4 | 5, number> };

export function reviewStats(rows: { star_rating: number | null; reply: string | null }[]): ReviewStats {
  const byStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewStats["byStar"];
  let sum = 0;
  let rated = 0;
  let unreplied = 0;
  for (const r of rows) {
    if (r.star_rating && r.star_rating >= 1 && r.star_rating <= 5) {
      byStar[r.star_rating as 1 | 2 | 3 | 4 | 5]++;
      sum += r.star_rating;
      rated++;
    }
    if (!r.reply) unreplied++;
  }
  return { count: rows.length, average: rated ? Math.round((sum / rated) * 10) / 10 : null, unreplied, byStar };
}

// ------------------------------------------------------------------ Local posts

export type LocalPostInput = { caption: string; link: string | null; imageUrl: string | null };
export type LocalPostBody = {
  languageCode: string;
  topicType: "STANDARD";
  summary: string;
  media?: { mediaFormat: "PHOTO"; sourceUrl: string }[];
  callToAction?: { actionType: "LEARN_MORE"; url: string };
};

/** Planner post → v4 LocalPost: STANDARD topic, caption as summary, photo from the public asset URL, LEARN_MORE → link. */
export function buildLocalPost(p: LocalPostInput): LocalPostBody {
  const summary = p.caption.trim();
  const body: LocalPostBody = { languageCode: "en-IN", topicType: "STANDARD", summary: summary.length > POST_SUMMARY_MAX ? `${summary.slice(0, POST_SUMMARY_MAX - 1).trimEnd()}…` : summary };
  if (p.imageUrl && /^https:\/\//.test(p.imageUrl)) body.media = [{ mediaFormat: "PHOTO", sourceUrl: p.imageUrl }];
  if (p.link && /^https?:\/\//.test(p.link)) body.callToAction = { actionType: "LEARN_MORE", url: p.link };
  return body;
}

// ------------------------------------------------------------------ Location + completeness

export type GbpLocation = {
  /** Business Information name "locations/{id}". */
  name: string;
  title: string | null;
  address: string | null;
  postalCode: string | null;
  phone: string | null;
  hasHours: boolean;
  description: string | null;
  primaryCategory: string | null;
  websiteUri: string | null;
  placeId: string | null;
  mapsUri: string | null;
  newReviewUri: string | null;
  photoCount: number | null;
};

export function parseLocation(raw: unknown): GbpLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof r.name !== "string" || !r.name.startsWith("locations/")) return null;
  const a = r.storefrontAddress ?? null;
  const lines: string[] = a ? [...(Array.isArray(a.addressLines) ? a.addressLines : []), a.locality, a.administrativeArea, a.postalCode].filter((x): x is string => typeof x === "string" && Boolean(x.trim())) : [];
  return {
    name: r.name,
    title: str(r.title, 200),
    address: lines.length ? lines.join(", ") : null,
    postalCode: a ? str(a.postalCode, 20) : null,
    phone: str(r.phoneNumbers?.primaryPhone, 40),
    hasHours: Array.isArray(r.regularHours?.periods) && r.regularHours.periods.length > 0,
    description: str(r.profile?.description, 2000),
    primaryCategory: str(r.categories?.primaryCategory?.displayName, 200) ?? str(r.categories?.primaryCategory?.name, 200),
    websiteUri: str(r.websiteUri, 500),
    placeId: str(r.metadata?.placeId, 300),
    mapsUri: str(r.metadata?.mapsUri, 500),
    newReviewUri: str(r.metadata?.newReviewUri, 500),
    photoCount: null,
  };
}

export type StoreProfile = {
  name: string;
  address: { line1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null } | null;
  phone: string | null;
  hours: string | null;
  description: string | null;
  category: string | null;
  website: string | null;
  photos: number;
};

export type CheckKey = "name" | "address" | "phone" | "hours" | "description" | "categories" | "website" | "photos";
/** ok: on Google (and consistent with the store) · gap: missing on Google · mismatch: differs · store_missing: fill your store profile first · pending: not connected yet. */
export type CheckState = "ok" | "gap" | "mismatch" | "store_missing" | "pending";
export type CheckItem = { key: CheckKey; label: string; state: CheckState; store: string | null; google: string | null; tip: string };

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
const host = (u: string | null) => {
  if (!u) return null;
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function storeAddressText(a: StoreProfile["address"]): string | null {
  if (!a) return null;
  const parts = [a.line1, a.city, a.state, a.postal_code].filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
  return parts.length ? parts.join(", ") : null;
}

/**
 * Completeness checklist: each listing field Google shows, comparing the store profile with the
 * connected location. Score = share of items in state "ok" (0–100). Without a location every item is
 * "pending" (or "store_missing"), so the seller sees what to prepare before creating the listing.
 */
export function scoreCompleteness(store: StoreProfile, loc: GbpLocation | null): { score: number; items: CheckItem[] } {
  const storeAddr = storeAddressText(store.address);
  const rows: [CheckKey, string, string | null, string | null, (s: string | null, g: string | null) => boolean, string][] = [
    ["name", "Business name", store.name || null, loc?.title ?? null, (s, g) => !s || norm(s) === norm(g), "Use the exact name customers see on your shop sign or website."],
    ["address", "Address", storeAddr, loc?.address ?? null, (s, g) => !s || !store.address?.postal_code || Boolean(g && g.includes(store.address.postal_code)), "Add your shop or pickup address (or set a service area on Google)."],
    ["phone", "Phone", store.phone, loc?.phone ?? null, (s, g) => !s || digits(s) === digits(g), "A phone number lets customers call straight from Maps."],
    ["hours", "Opening hours", store.hours, loc?.hasHours ? "Set" : null, () => true, "Listings with hours appear in “open now” searches."],
    ["description", "Description", store.description, loc?.description ?? null, () => true, `Describe what you sell in up to ${DESCRIPTION_MAX} characters.`],
    ["categories", "Category", store.category, loc?.primaryCategory ?? null, () => true, "Pick the primary category that best matches your shop."],
    ["website", "Website", store.website, loc?.websiteUri ?? null, (s, g) => !s || host(s) === host(g), "Link your store so shoppers can buy online."],
    ["photos", "Photos", store.photos ? `${store.photos}` : null, loc?.photoCount ? `${loc.photoCount}` : null, () => true, "Add a logo, cover photo and a few product photos."],
  ];
  const items: CheckItem[] = rows.map(([key, label, s, g, matches, tip]) => {
    let state: CheckState;
    if (!loc) state = s ? "pending" : "store_missing";
    else if (!g) state = "gap";
    else state = matches(s, g) ? "ok" : "mismatch";
    return { key, label, state, store: s, google: g, tip };
  });
  return { score: Math.round((items.filter((i) => i.state === "ok").length / items.length) * 100), items };
}

// ------------------------------------------------------------------ Review requests

export function reviewLink(placeId: string | null): string | null {
  return placeId && /^[A-Za-z0-9_-]{10,300}$/.test(placeId) ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null;
}

export function whatsappShareLink(storeName: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Thank you for shopping with ${storeName}! If you have a minute, we'd love a Google review: ${link}`)}`;
}

/** v1 "locations/{id}" + v4 "accounts/{a}" → v4 parent "accounts/{a}/locations/{id}". */
export function v4LocationName(account: string, location: string): string | null {
  const a = /^accounts\/[\w-]+$/.test(account) ? account : null;
  const l = /^locations\/[\w-]+$/.test(location) ? location : null;
  return a && l ? `${a}/${l}` : null;
}
