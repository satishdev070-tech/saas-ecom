import "server-only";
import { logger } from "@/lib/observability/logger";
import { getAppCredential } from "@/features/platform-apps/server";
import { GBP_SCOPE, parseLocation, parseReview, type GbpLocation, type LocalPostBody, type ParsedReview } from "../gbp";

/**
 * Google Business Profile adapters, written against the official references:
 *   OAuth 2.0 web server flow (accounts.google.com/o/oauth2/v2/auth, oauth2.googleapis.com/token),
 *     scope business.manage, access_type=offline + prompt=consent so Google returns a refresh token.
 *   Account Management API v1  GET  mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   Business Information API v1 GET mybusinessbusinessinformation.googleapis.com/v1/{accounts/*}/locations?readMask=…
 *                               GET/PATCH …/v1/{locations/*}
 *   My Business API v4          GET  mybusiness.googleapis.com/v4/{accounts/*}/{locations/*}/reviews
 *                               PUT  …/reviews/{id}/reply      (verified locations only)
 *                               POST …/localPosts
 *                               GET  …/media?pageSize=1        (totalMediaItemCount)
 * These APIs need Google's Business Profile API access approval for the platform's Cloud project;
 * until it's granted Google answers 403/429 and we surface that wording.
 * Errors returned to callers are our own wording; tokens are never logged.
 */

export type Result<T> = { ok: true; data: T } | { ok: false; message: string; expired?: boolean };
const TIMEOUT = 15_000;
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
export const LOCATION_READ_MASK = "name,title,phoneNumbers,storefrontAddress,regularHours,profile,categories,websiteUri,metadata";

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function fail(op: string, status: number, body: Record<string, unknown>, message: string): { ok: false; message: string; expired?: boolean } {
  const err = (body.error ?? {}) as { code?: number; status?: string };
  logger.warn("gbp.api_error", { op, status, code: err.code, reason: err.status ?? (typeof body.error === "string" ? body.error : undefined) });
  if (status === 401 || body.error === "invalid_grant") return { ok: false, message: "The Google connection has expired or was revoked. Reconnect Google Business Profile.", expired: true };
  if (status === 403 || status === 429) return { ok: false, message: "Google refused the request. The platform's Google Business Profile API access may still be awaiting Google's approval, or this account can't manage the location." };
  return { ok: false, message };
}

const get = (url: string, token: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });

/** null when the platform hasn't configured a Google OAuth client. */
export async function googleClient(): Promise<{ id: string; secret: string } | null> {
  const c = await getAppCredential("google");
  return c?.clientId && c.secret ? { id: c.clientId, secret: c.secret } : null;
}

export function gbpAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: GBP_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type Tokens = { accessToken: string; refreshToken: string | null; expiresAt: string | null };

async function token(body: Record<string, string>, op: string): Promise<Result<Tokens>> {
  const c = await googleClient();
  if (!c) return { ok: false, message: "Google sign-in isn't configured by the platform yet." };
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ ...body, client_id: c.id, client_secret: c.secret }), signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  if (!res.ok || typeof j.access_token !== "string") return fail(op, res.status, j, "Google didn't accept the sign-in. Try connecting again.");
  return {
    ok: true,
    data: { accessToken: j.access_token, refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null, expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null },
  };
}

export const gbpExchange = (code: string, redirectUri: string) => token({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }, "token_exchange");
export const gbpRefresh = (refreshToken: string) => token({ refresh_token: refreshToken, grant_type: "refresh_token" }, "token_refresh");

export type GbpAccount = { name: string; accountName: string };

export async function listAccounts(accessToken: string): Promise<Result<GbpAccount[]>> {
  const res = await get("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", accessToken);
  const j = await json(res);
  if (!res.ok) return fail("accounts.list", res.status, j, "Couldn't read your Google Business accounts.");
  const accounts = Array.isArray(j.accounts) ? (j.accounts as Record<string, unknown>[]) : [];
  return { ok: true, data: accounts.filter((a) => typeof a.name === "string").map((a) => ({ name: a.name as string, accountName: typeof a.accountName === "string" ? a.accountName : "Google account" })) };
}

export type LocationChoice = { account: string; location: string; title: string; address: string | null };

/** All locations the user can manage, across up to 5 accounts (100 per account). */
export async function listLocations(accessToken: string): Promise<Result<LocationChoice[]>> {
  const accts = await listAccounts(accessToken);
  if (!accts.ok) return accts;
  const out: LocationChoice[] = [];
  for (const a of accts.data.slice(0, 5)) {
    const res = await get(`${INFO}/${a.name}/locations?pageSize=100&readMask=name,title,storefrontAddress`, accessToken);
    const j = await json(res);
    if (!res.ok) return fail("locations.list", res.status, j, "Couldn't read your Google Business locations.");
    for (const raw of Array.isArray(j.locations) ? j.locations : []) {
      const l = parseLocation(raw);
      if (l) out.push({ account: a.name, location: l.name, title: l.title ?? "Untitled location", address: l.address });
    }
  }
  return { ok: true, data: out };
}

/** Full location (Business Information) plus its photo count (v4 media). */
export async function getLocation(accessToken: string, v4Name: string): Promise<Result<GbpLocation>> {
  const locName = v4Name.slice(v4Name.indexOf("locations/"));
  const res = await get(`${INFO}/${locName}?readMask=${LOCATION_READ_MASK}`, accessToken);
  const j = await json(res);
  if (!res.ok) return fail("locations.get", res.status, j, "Couldn't read your Google Business listing.");
  const loc = parseLocation(j);
  if (!loc) return { ok: false, message: "Google returned an unexpected listing." };
  const m = await get(`${V4}/${v4Name}/media?pageSize=1`, accessToken);
  if (m.ok) {
    const mj = await json(m);
    loc.photoCount = typeof mj.totalMediaItemCount === "number" ? mj.totalMediaItemCount : Array.isArray(mj.mediaItems) ? mj.mediaItems.length : 0;
  }
  return { ok: true, data: loc };
}

/** PATCH profile.description (Business Information API, updateMask). */
export async function updateDescription(accessToken: string, v4Name: string, description: string): Promise<Result<null>> {
  const locName = v4Name.slice(v4Name.indexOf("locations/"));
  const res = await fetch(`${INFO}/${locName}?updateMask=profile.description`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { description } }),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) return fail("locations.patch", res.status, await json(res), "Google didn't accept the description.");
  return { ok: true, data: null };
}

/** Reviews, newest first, up to `maxPages` × 50. */
export async function listReviews(accessToken: string, v4Name: string, maxPages = 10): Promise<Result<{ reviews: ParsedReview[]; average: number | null; total: number | null }>> {
  const reviews: ParsedReview[] = [];
  let pageToken = "";
  let average: number | null = null;
  let total: number | null = null;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc", ...(pageToken ? { pageToken } : {}) });
    const res = await get(`${V4}/${v4Name}/reviews?${q}`, accessToken);
    const j = await json(res);
    if (!res.ok) return fail("reviews.list", res.status, j, "Couldn't read your Google reviews.");
    if (typeof j.averageRating === "number") average = j.averageRating;
    if (typeof j.totalReviewCount === "number") total = j.totalReviewCount;
    for (const raw of Array.isArray(j.reviews) ? j.reviews : []) {
      const r = parseReview(raw);
      if (r) reviews.push(r);
    }
    pageToken = typeof j.nextPageToken === "string" ? j.nextPageToken : "";
    if (!pageToken) break;
  }
  return { ok: true, data: { reviews, average, total } };
}

/** Creates or updates the owner reply (PUT …/reviews/{id}/reply). */
export async function putReply(accessToken: string, v4Name: string, reviewId: string, comment: string): Promise<Result<{ updateTime: string | null }>> {
  const res = await fetch(`${V4}/${v4Name}/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const j = await json(res);
  if (!res.ok) return fail("reviews.updateReply", res.status, j, "Google didn't accept the reply. Replies work only on verified listings.");
  return { ok: true, data: { updateTime: typeof j.updateTime === "string" ? j.updateTime : null } };
}

export async function createLocalPost(accessToken: string, v4Name: string, body: LocalPostBody): Promise<Result<{ id: string; url: string | null }>> {
  const res = await fetch(`${V4}/${v4Name}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const j = await json(res);
  if (!res.ok || typeof j.name !== "string") return fail("localPosts.create", res.status, j, "Google didn't accept the post.");
  return { ok: true, data: { id: j.name, url: typeof j.searchUrl === "string" ? j.searchUrl : null } };
}
