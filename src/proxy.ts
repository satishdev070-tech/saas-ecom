import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import { normalizeHost } from "@/lib/tenant/host";
import { decideRoute, STORE_ROUTE_PREFIX, INTERNAL_HOST_HEADER, INTERNAL_REQUEST_HEADERS, REQUEST_ID_HEADER, THEME_PREVIEW_HEADER } from "@/lib/tenant/routing";
import { THEME_PREVIEW_COOKIE, THEME_PREVIEW_EXIT, THEME_PREVIEW_PARAM, THEME_PREVIEW_TTL_SECONDS, isPreviewKeyShape } from "@/features/theme/marketplace/live-preview";
import { framingHeaders } from "@/lib/security/headers";
import { platformOrigin } from "@/lib/platform/urls";
import { EDGE_HOST_HEADER, EDGE_SIG_HEADER, EDGE_TS_HEADER, verifyEdgeHost } from "@/lib/tenant/edge-signature";

/**
 * Request entry point (Next.js 16 "proxy", formerly middleware). Responsibilities:
 *  1. Strip client-supplied internal headers.
 *  2. Work out the effective hostname (signed Worker header, else Host).
 *  3. Classify the host and rewrite storefront hosts into /store/[host]/...
 *  4. Refresh the Supabase session cookie when one is present.
 *
 * It does NOT authorize anything. Authorization happens in server code + RLS.
 */

/** A private (underscore) segment is never routable, so rewriting here always renders the 404 page. */
const NOT_FOUND_PATH = "/_unknown-host";
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

type PendingCookie = { name: string; value: string; options: CookieOptions };

async function effectiveHost(request: NextRequest): Promise<string | null> {
  const edgeHost = request.headers.get(EDGE_HOST_HEADER);
  if (edgeHost) {
    const verified = await verifyEdgeHost({
      secret: process.env.EDGE_SHARED_SECRET,
      host: edgeHost,
      ts: request.headers.get(EDGE_TS_HEADER),
      signature: request.headers.get(EDGE_SIG_HEADER),
    });
    if (verified) return normalizeHost(edgeHost);
  }
  return normalizeHost(request.headers.get("host"));
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export async function proxy(request: NextRequest) {
  const env = publicEnv();
  const host = await effectiveHost(request);

  // (4) Session refresh — only when an auth cookie exists, so anonymous storefront
  // traffic never pays for a Supabase round-trip.
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  if (hasSupabaseAuthCookie(request)) {
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const c of cookiesToSet) {
            request.cookies.set(c.name, c.value);
            pendingCookies.push(c);
          }
          Object.assign(pendingHeaders, headers);
        },
      },
    });
    await supabase.auth.getClaims();
  }

  // (1) Build forwarded request headers AFTER cookie refresh so refreshed cookies flow downstream.
  const forwarded = new Headers(request.headers);
  for (const h of INTERNAL_REQUEST_HEADERS) forwarded.delete(h);
  for (const h of [EDGE_HOST_HEADER, EDGE_TS_HEADER, EDGE_SIG_HEADER]) forwarded.delete(h);
  if (host) forwarded.set(INTERNAL_HOST_HEADER, host);
  const inboundId = request.headers.get(REQUEST_ID_HEADER);
  const requestId = inboundId && REQUEST_ID_PATTERN.test(inboundId) ? inboundId : crypto.randomUUID();
  forwarded.set(REQUEST_ID_HEADER, requestId);

  // (3) Routing decision.
  const decision = decideRoute(host, request.nextUrl.pathname, env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN);
  const isStoreRoute = decision.action === "rewrite" && decision.pathname.startsWith(`${STORE_ROUTE_PREFIX}/`);

  // Marketplace Live Preview: only a key is passed along; whether the tenant may use it (demo
  // stores only) is decided at render time. Nothing here is trusted beyond its shape.
  const previewParam = isStoreRoute ? request.nextUrl.searchParams.get(THEME_PREVIEW_PARAM) : null;
  const previewKey = isStoreRoute ? (isPreviewKeyShape(previewParam) ? previewParam : previewParam === THEME_PREVIEW_EXIT ? null : request.cookies.get(THEME_PREVIEW_COOKIE)?.value) : null;
  if (isPreviewKeyShape(previewKey)) forwarded.set(THEME_PREVIEW_HEADER, previewKey);
  let response: NextResponse;
  if (decision.action === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    response = NextResponse.rewrite(url, { request: { headers: forwarded } });
  } else if (decision.action === "not-found") {
    const url = request.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    url.search = "";
    response = NextResponse.rewrite(url, { request: { headers: forwarded } });
    response.headers.set("X-Robots-Tag", "noindex");
  } else {
    response = NextResponse.next({ request: { headers: forwarded } });
  }

  for (const [key, value] of Object.entries(framingHeaders(isStoreRoute ? "store" : "platform", platformOrigin()))) response.headers.set(key, value);
  if (previewParam === THEME_PREVIEW_EXIT) response.cookies.delete(THEME_PREVIEW_COOKIE);
  else if (isPreviewKeyShape(previewParam)) {
    // SameSite=None (https only) so navigation inside the marketplace's preview iframe keeps the theme.
    const secure = request.nextUrl.protocol === "https:";
    response.cookies.set(THEME_PREVIEW_COOKIE, previewParam, { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/", maxAge: THEME_PREVIEW_TTL_SECONDS });
  }
  for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(pendingHeaders)) response.headers.set(key, value);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    // Everything except build assets, image optimizer and static files with an extension
    // (robots.txt / sitemap.xml are tenant-specific and DO go through the proxy).
    "/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|css|js|map|woff2?)$).*)",
  ],
};
