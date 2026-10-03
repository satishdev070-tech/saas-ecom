import "server-only";
import { serverEnv } from "@/lib/env/server";
import { logger } from "@/lib/observability/logger";
import { getAppCredential, type AppCredential } from "@/features/platform-apps/server";

/**
 * Social network adapters, written against the official docs:
 *   Meta   — Facebook Login + Graph API: /me/accounts (Page tokens), POST /{page-id}/photos,
 *            Instagram content publishing POST /{ig-id}/media → POST /{ig-id}/media_publish
 *            (JPEG only, public image URL, 100 posts / 24 h).
 *   Pinterest — API v5: OAuth code → POST /v5/oauth/token (Basic auth, form body), GET /v5/boards,
 *            POST /v5/pins { board_id, media_source: { source_type: "image_url", url } }.
 *   YouTube — Google OAuth + Data API v3 channels.list(mine=true). Connect only: video upload
 *            is not offered (no video pipeline), and the UI says so.
 * Errors returned to callers are our own wording; provider payloads are logged without tokens.
 */

export type SocialNetwork = "meta" | "pinterest" | "youtube";
export type Result<T> = { ok: true; data: T } | { ok: false; message: string; expired?: boolean };

const TIMEOUT = 15_000;

/** The platform OAuth app behind each network (YouTube uses the Google app). */
const APP_FOR = { meta: "meta", pinterest: "pinterest", youtube: "google" } as const;

/** Platform app credentials (console first, env fallback; see features/platform-apps). */
export function networkCredential(n: SocialNetwork): Promise<AppCredential | null> {
  return getAppCredential(APP_FOR[n]);
}

export async function networkConfigured(n: SocialNetwork): Promise<boolean> {
  return (await networkCredential(n)) !== null;
}

/** Client id + secret for a network's platform app, or null when it isn't set up. */
async function appCred(n: SocialNetwork): Promise<{ id: string; secret: string } | null> {
  const c = await networkCredential(n);
  return c?.clientId ? { id: c.clientId, secret: c.secret } : null;
}
const NOT_CONFIGURED = { ok: false as const, message: "This network isn't set up on the platform yet." };

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function fail(provider: string, status: number, body: Record<string, unknown>, message: string): { ok: false; message: string; expired?: boolean } {
  const err = (body.error ?? {}) as { code?: number; type?: string; message?: string };
  logger.warn("social.api_error", { provider, status, code: err.code ?? body.code, type: err.type });
  const expired = status === 401 || err.code === 190;
  return { ok: false, message: expired ? "The connection has expired or was revoked. Reconnect the account." : message, expired };
}

// ------------------------------------------------------------------ Meta (Facebook + Instagram)

const graph = () => `https://graph.facebook.com/${serverEnv().META_GRAPH_VERSION}`;
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management", "pages_messaging", "instagram_manage_messages"];

export async function metaAuthUrl(redirectUri: string, state: string): Promise<string | null> {
  const c = await appCred("meta");
  if (!c) return null;
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${serverEnv().META_GRAPH_VERSION}/dialog/oauth?${q}`;
}

export type MetaPage = { id: string; name: string; accessToken: string; instagram: { id: string; username: string | null } | null };

/** Code → long-lived user token → the Pages the user granted (with Page tokens and linked IG accounts). */
export async function metaExchange(code: string, redirectUri: string): Promise<Result<{ pages: MetaPage[]; expiresAt: string | null }>> {
  const e = await appCred("meta");
  if (!e) return NOT_CONFIGURED;
  const short = await fetch(`${graph()}/oauth/access_token?${new URLSearchParams({ client_id: e.id, client_secret: e.secret, redirect_uri: redirectUri, code })}`, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const sj = await json(short);
  if (!short.ok || typeof sj.access_token !== "string") return fail("meta", short.status, sj, "Facebook didn't accept the sign-in. Try connecting again.");
  const long = await fetch(`${graph()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: e.id, client_secret: e.secret, fb_exchange_token: sj.access_token })}`, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const lj = await json(long);
  const userToken = typeof lj.access_token === "string" ? lj.access_token : sj.access_token;
  const expiresAt = typeof lj.expires_in === "number" ? new Date(Date.now() + lj.expires_in * 1000).toISOString() : null;
  const pages = await fetch(`${graph()}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: userToken, limit: "25" })}`, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const pj = await json(pages);
  if (!pages.ok) return fail("meta", pages.status, pj, "We couldn't read your Facebook Pages.");
  const list = ((pj.data as unknown[]) ?? []).flatMap((p) => {
    const r = p as { id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } };
    return r.id && r.access_token ? [{ id: r.id, name: r.name ?? "Facebook Page", accessToken: r.access_token, instagram: r.instagram_business_account?.id ? { id: r.instagram_business_account.id, username: r.instagram_business_account.username ?? null } : null }] : [];
  });
  if (!list.length) return { ok: false, message: "No Facebook Page was shared. Reconnect and select the Page for your store." };
  return { ok: true, data: { pages: list, expiresAt } };
}

export async function metaVerify(pageId: string, pageToken: string): Promise<Result<{ name: string }>> {
  const res = await fetch(`${graph()}/${encodeURIComponent(pageId)}?${new URLSearchParams({ fields: "name", access_token: pageToken })}`, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  return res.ok ? { ok: true, data: { name: String(j.name ?? "") } } : fail("meta", res.status, j, "Facebook rejected the connection check.");
}

export async function publishFacebookPhoto(pageId: string, pageToken: string, imageUrl: string, message: string): Promise<Result<{ id: string; url: string | null }>> {
  const res = await fetch(`${graph()}/${encodeURIComponent(pageId)}/photos`, { method: "POST", body: new URLSearchParams({ url: imageUrl, message, access_token: pageToken }), signal: AbortSignal.timeout(30_000) });
  const j = await json(res);
  if (!res.ok || typeof j.id !== "string") return fail("facebook", res.status, j, "Facebook didn't accept the post.");
  const postId = typeof j.post_id === "string" ? j.post_id : null;
  return { ok: true, data: { id: j.id, url: postId ? `https://www.facebook.com/${postId}` : null } };
}

export async function publishInstagramImage(igId: string, pageToken: string, imageUrl: string, caption: string): Promise<Result<{ id: string; url: string | null }>> {
  const create = await fetch(`${graph()}/${encodeURIComponent(igId)}/media`, { method: "POST", body: new URLSearchParams({ image_url: imageUrl, caption, access_token: pageToken }), signal: AbortSignal.timeout(30_000) });
  const cj = await json(create);
  if (!create.ok || typeof cj.id !== "string") return fail("instagram", create.status, cj, "Instagram couldn't use the image. Use a JPEG image.");
  const pub = await fetch(`${graph()}/${encodeURIComponent(igId)}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: cj.id, access_token: pageToken }), signal: AbortSignal.timeout(30_000) });
  const pj = await json(pub);
  if (!pub.ok || typeof pj.id !== "string") return fail("instagram", pub.status, pj, "Instagram didn't publish the post (the account may be over its 100 posts per day limit).");
  return { ok: true, data: { id: pj.id, url: null } };
}

// ------------------------------------------------------------------ Pinterest

const PIN_API = "https://api.pinterest.com/v5";
export const PINTEREST_SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];

export async function pinterestAuthUrl(redirectUri: string, state: string): Promise<string | null> {
  const c = await appCred("pinterest");
  if (!c) return null;
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, response_type: "code", scope: PINTEREST_SCOPES.join(","), state });
  return `https://www.pinterest.com/oauth/?${q}`;
}

type PinTokens = { accessToken: string; refreshToken: string | null; expiresAt: string | null };

async function pinterestToken(body: Record<string, string>): Promise<Result<PinTokens>> {
  const e = await appCred("pinterest");
  if (!e) return NOT_CONFIGURED;
  const res = await fetch(`${PIN_API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${e.id}:${e.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  const j = await json(res);
  if (!res.ok || typeof j.access_token !== "string") return fail("pinterest", res.status, j, "Pinterest didn't accept the sign-in. Try connecting again.");
  return { ok: true, data: { accessToken: j.access_token, refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null, expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null } };
}

export const pinterestExchange = (code: string, redirectUri: string) => pinterestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
export const pinterestRefresh = (refreshToken: string) => pinterestToken({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function pinterestAccount(token: string): Promise<Result<{ username: string }>> {
  const res = await fetch(`${PIN_API}/user_account`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  return res.ok ? { ok: true, data: { username: String(j.username ?? "") } } : fail("pinterest", res.status, j, "Pinterest rejected the connection check.");
}

export async function pinterestBoards(token: string): Promise<Result<{ id: string; name: string }[]>> {
  const res = await fetch(`${PIN_API}/boards?page_size=100`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  if (!res.ok) return fail("pinterest", res.status, j, "We couldn't read your Pinterest boards.");
  return { ok: true, data: ((j.items as { id?: string; name?: string }[]) ?? []).flatMap((b) => (b.id ? [{ id: b.id, name: b.name ?? "Board" }] : [])) };
}

export async function createPin(token: string, input: { boardId: string; title: string; description: string; link: string | null; imageUrl: string; altText: string }): Promise<Result<{ id: string; url: string }>> {
  const res = await fetch(`${PIN_API}/pins`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ board_id: input.boardId, title: input.title.slice(0, 100), description: input.description.slice(0, 800), alt_text: input.altText.slice(0, 500), ...(input.link ? { link: input.link } : {}), media_source: { source_type: "image_url", url: input.imageUrl } }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await json(res);
  if (!res.ok || typeof j.id !== "string") return fail("pinterest", res.status, j, "Pinterest didn't accept the Pin.");
  return { ok: true, data: { id: j.id, url: `https://www.pinterest.com/pin/${j.id}/` } };
}

// ------------------------------------------------------------------ YouTube (connect only)

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];

export async function youtubeAuthUrl(redirectUri: string, state: string): Promise<string | null> {
  const c = await appCred("youtube");
  if (!c) return null;
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, response_type: "code", scope: YOUTUBE_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function youtubeExchange(code: string, redirectUri: string): Promise<Result<{ accessToken: string; refreshToken: string | null; expiresAt: string | null; channel: { id: string; title: string } }>> {
  const e = await appCred("youtube");
  if (!e) return NOT_CONFIGURED;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ code, client_id: e.id, client_secret: e.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }), signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  if (!res.ok || typeof j.access_token !== "string") return fail("youtube", res.status, j, "Google didn't accept the sign-in. Try connecting again.");
  const ch = await youtubeChannel(j.access_token);
  if (!ch.ok) return ch;
  return { ok: true, data: { accessToken: j.access_token, refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : null, expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null, channel: ch.data } };
}

export async function youtubeChannel(token: string): Promise<Result<{ id: string; title: string }>> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  if (!res.ok) return fail("youtube", res.status, j, "YouTube rejected the connection check.");
  const item = ((j.items as { id?: string; snippet?: { title?: string } }[]) ?? [])[0];
  if (!item?.id) return { ok: false, message: "This Google account has no YouTube channel." };
  return { ok: true, data: { id: item.id, title: item.snippet?.title ?? "YouTube channel" } };
}

export async function youtubeRefresh(refreshToken: string): Promise<Result<{ accessToken: string; expiresAt: string | null }>> {
  const e = await appCred("youtube");
  if (!e) return NOT_CONFIGURED;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ refresh_token: refreshToken, client_id: e.id, client_secret: e.secret, grant_type: "refresh_token" }), signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const j = await json(res);
  if (!res.ok || typeof j.access_token !== "string") return fail("youtube", res.status, j, "Google couldn't refresh the connection.");
  return { ok: true, data: { accessToken: j.access_token, expiresAt: typeof j.expires_in === "number" ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null } };
}
