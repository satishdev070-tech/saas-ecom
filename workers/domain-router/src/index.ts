/**
 * The Paliya domain router (Cloudflare Worker, Cloudflare for SaaS fallback origin).
 *
 * Customer domains (shop.brand.in) are CNAMEd to CUSTOM_DOMAIN_CNAME_TARGET. Cloudflare
 * terminates TLS for the custom hostname and runs this Worker, which proxies the request
 * to the app origin and proves the original hostname with an HMAC signature:
 *
 *   x-paliya-edge-host: <hostname>
 *   x-paliya-edge-ts:   <unix seconds>
 *   x-paliya-edge-sig:  hex(HMAC-SHA256(EDGE_SHARED_SECRET, `${host}\n${ts}`))
 *
 * The app (src/lib/tenant/edge-signature.ts) accepts the forwarded host only when the
 * signature is valid and fresh. Client-supplied x-paliya-* headers are always stripped.
 * No tenant lookup happens here: the app maps verified hostnames to tenants.
 */

export interface Env {
  /** App origin, e.g. https://origin.paliya.store (no trailing slash). */
  ORIGIN_URL: string;
  /** Same value as the app's EDGE_SHARED_SECRET (wrangler secret put EDGE_SHARED_SECRET). */
  EDGE_SHARED_SECRET: string;
}

const encoder = new TextEncoder();
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer"];

export async function signHost(secret: string, host: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${host}\n${ts}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;
  const host = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST_RE.test(host) ? host : null;
}

export async function buildOriginRequest(request: Request, env: Env, now: number = Math.floor(Date.now() / 1000)): Promise<Request | Response> {
  const incoming = new URL(request.url);
  const host = normalizeHost(incoming.hostname);
  if (!host) return new Response("Bad request", { status: 400 });
  if (!env.ORIGIN_URL || !env.EDGE_SHARED_SECRET || env.EDGE_SHARED_SECRET.length < 32) return new Response("Service unavailable", { status: 503 });

  const origin = new URL(env.ORIGIN_URL);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-paliya-")) headers.delete(name);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set("x-paliya-edge-host", host);
  headers.set("x-paliya-edge-ts", String(now));
  headers.set("x-paliya-edge-sig", await signHost(env.EDGE_SHARED_SECRET, host, now));
  headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", "https");

  return new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

/** Removes internal routing headers that would reveal the app's rewrite target. */
async function strip(res: Response): Promise<Response> {
  if (!res.headers.has("x-middleware-rewrite")) return res;
  const out = new Response(res.body, res);
  out.headers.delete("x-middleware-rewrite");
  return out;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const upstream = await buildOriginRequest(request, env);
    if (upstream instanceof Response) return upstream;
    try {
      const res = await strip(await fetch(upstream));
      // Redirects from the origin that point at the origin host are rewritten back to the customer host.
      const location = res.headers.get("location");
      if (location) {
        const loc = new URL(location, upstream.url);
        if (loc.host === new URL(env.ORIGIN_URL).host) {
          loc.host = new URL(request.url).host;
          const out = new Response(res.body, res);
          out.headers.set("location", loc.toString());
          return out;
        }
      }
      return res;
    } catch {
      return new Response("Store temporarily unavailable", { status: 502, headers: { "retry-after": "30" } });
    }
  },
};

export default worker;
