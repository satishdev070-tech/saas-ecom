import { describe, expect, it, vi } from "vitest";
import {
  addProjectDomain,
  challengeRecords,
  companionHostname,
  getDomainConfig,
  inspectProjectDomain,
  mapVercelState,
  removeProjectDomain,
  routingRecord,
  vercelConfigFrom,
  verifyProjectDomain,
  VercelApiError,
  VERCEL_FALLBACK_A,
  VERCEL_FALLBACK_CNAME,
  type VercelConfig,
} from "@/lib/vercel/domains";
import { parseStoredDnsRecords, vercelStateMessage } from "@/features/domains/vercel-status";

type Call = { url: URL; method: string; body: unknown; auth: string | null };

function fakeFetch(routes: Array<{ match: (c: Call) => boolean; status: number; json: unknown }>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.get("authorization") };
    calls.push(call);
    const route = routes.find((r) => r.match(call));
    if (!route) return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), { status: 404 });
    return new Response(JSON.stringify(route.json), { status: route.status, headers: { "content-type": "application/json" } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const base = { token: "vercel_test_token_123456789", projectId: "prj_abc123", teamId: "team_xyz" };
const cfg = (fetchImpl: typeof fetch): VercelConfig => ({ ...base, fetchImpl });

const domain = (name: string, extra: Record<string, unknown> = {}) => ({ name, apexName: "brand.in", projectId: "prj_abc123", verified: true, ...extra });
const config = (extra: Record<string, unknown> = {}) => ({
  configuredBy: null,
  misconfigured: true,
  acceptedChallenges: ["http-01"],
  recommendedIPv4: [
    { rank: 2, value: ["76.76.21.98"] },
    { rank: 1, value: ["216.198.79.1"] },
  ],
  recommendedCNAME: [{ rank: 1, value: "d1d4fc829fe7bc7c.vercel-dns-017.com." }],
  ...extra,
});

describe("vercelConfigFrom", () => {
  it("requires token + project id, team optional", () => {
    expect(vercelConfigFrom({})).toBeNull();
    expect(vercelConfigFrom({ VERCEL_TOKEN: "short", VERCEL_PROJECT_ID: "prj_1" })).toBeNull();
    expect(vercelConfigFrom({ VERCEL_TOKEN: base.token })).toBeNull();
    expect(vercelConfigFrom({ VERCEL_TOKEN: base.token, VERCEL_PROJECT_ID: "prj/../x" })).toBeNull();
    expect(vercelConfigFrom({ VERCEL_TOKEN: base.token, VERCEL_PROJECT_ID: "prj_1" })).toEqual({ token: base.token, projectId: "prj_1", teamId: null });
    expect(vercelConfigFrom({ VERCEL_TOKEN: base.token, VERCEL_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" })?.teamId).toBe("team_1");
  });
});

describe("mapVercelState", () => {
  it("never reports active unless verified and not misconfigured", () => {
    expect(mapVercelState({ verified: false }, { misconfigured: false, configuredBy: "A" })).toBe("verifying");
    expect(mapVercelState({ verified: true }, null)).toBe("pending_dns");
    expect(mapVercelState({ verified: true }, { misconfigured: true, configuredBy: null })).toBe("pending_dns");
    expect(mapVercelState({ verified: true }, { misconfigured: true, configuredBy: "CNAME" })).toBe("misconfigured");
    expect(mapVercelState({ verified: true }, { misconfigured: false, configuredBy: "A" })).toBe("active");
  });
});

describe("DNS record helpers", () => {
  it("apex gets an A record with the rank-1 IP; subdomains a CNAME with the rank-1 target", () => {
    const c = config();
    expect(routingRecord("brand.in", "brand.in", c as never)).toEqual({ type: "A", name: "brand.in", value: "216.198.79.1", purpose: "routing" });
    expect(routingRecord("www.brand.in", "brand.in", c as never)).toEqual({ type: "CNAME", name: "www.brand.in", value: "d1d4fc829fe7bc7c.vercel-dns-017.com", purpose: "routing" });
  });
  it("falls back to Vercel's documented defaults when no recommendation is returned", () => {
    const empty = config({ recommendedIPv4: [], recommendedCNAME: [] });
    expect(routingRecord("brand.in", "brand.in", empty as never).value).toBe(VERCEL_FALLBACK_A);
    expect(routingRecord("shop.brand.in", "brand.in", null).value).toBe(VERCEL_FALLBACK_CNAME);
  });
  it("turns TXT challenges into records and ignores other types", () => {
    expect(
      challengeRecords([
        { type: "TXT", domain: "_vercel.brand.in", value: "vc-domain-verify=brand.in,abc", reason: "pending_domain_verification" },
        { type: "HTTP", domain: "brand.in", value: "x", reason: "" },
      ]),
    ).toEqual([{ type: "TXT", name: "_vercel.brand.in", value: "vc-domain-verify=brand.in,abc", purpose: "vercel-verification" }]);
  });
  it("pairs apex and www only", () => {
    expect(companionHostname("brand.in", "brand.in")).toBe("www.brand.in");
    expect(companionHostname("www.brand.in", "brand.in")).toBe("brand.in");
    expect(companionHostname("shop.brand.in", "brand.in")).toBeNull();
  });
});

describe("API client (mocked fetch)", () => {
  it("adds a domain with bearer auth, teamId and a redirect body", async () => {
    const f = fakeFetch([{ match: (c) => c.method === "POST" && c.url.pathname === "/v10/projects/prj_abc123/domains", status: 200, json: domain("brand.in") }]);
    const d = await addProjectDomain(cfg(f.impl), "brand.in", { redirect: "www.brand.in" });
    expect(d.name).toBe("brand.in");
    expect(f.calls[0]!.auth).toBe(`Bearer ${base.token}`);
    expect(f.calls[0]!.url.searchParams.get("teamId")).toBe("team_xyz");
    expect(f.calls[0]!.body).toEqual({ name: "brand.in", redirect: "www.brand.in", redirectStatusCode: 308 });
  });

  it("treats 'already on this project' as success and rethrows when it's on another project", async () => {
    const mine = fakeFetch([
      { match: (c) => c.method === "POST", status: 400, json: { error: { code: "domain_already_in_use", message: "already exists" } } },
      { match: (c) => c.method === "GET" && c.url.pathname === "/v9/projects/prj_abc123/domains/www.brand.in", status: 200, json: domain("www.brand.in") },
    ]);
    expect((await addProjectDomain(cfg(mine.impl), "www.brand.in")).name).toBe("www.brand.in");

    const other = fakeFetch([{ match: (c) => c.method === "POST", status: 409, json: { error: { code: "domain_taken", message: "assigned to another project" } } }]);
    await expect(addProjectDomain(cfg(other.impl), "www.brand.in")).rejects.toMatchObject({ status: 409, code: "domain_taken" });
  });

  it("verify returns the current record while the TXT challenge is unmet (400)", async () => {
    const f = fakeFetch([
      { match: (c) => c.method === "POST" && c.url.pathname.endsWith("/verify"), status: 400, json: { error: { code: "missing_txt_record", message: "no TXT" } } },
      { match: (c) => c.method === "GET", status: 200, json: domain("brand.in", { verified: false, verification: [{ type: "TXT", domain: "_vercel.brand.in", value: "v", reason: "r" }] }) },
    ]);
    const d = await verifyProjectDomain(cfg(f.impl), "brand.in");
    expect(d?.verified).toBe(false);
    expect(d?.verification).toHaveLength(1);
  });

  it("reads the domain config with projectIdOrName and rejects malformed responses", async () => {
    const ok = fakeFetch([{ match: (c) => c.url.pathname === "/v6/domains/brand.in/config", status: 200, json: config() }]);
    const c = await getDomainConfig(cfg(ok.impl), "brand.in");
    expect(c.misconfigured).toBe(true);
    expect(ok.calls[0]!.url.searchParams.get("projectIdOrName")).toBe("prj_abc123");

    const bad = fakeFetch([{ match: () => true, status: 200, json: { nope: true } }]);
    await expect(getDomainConfig(cfg(bad.impl), "brand.in")).rejects.toBeInstanceOf(VercelApiError);
  });

  it("removes with removeRedirects and treats 404 as success", async () => {
    const f = fakeFetch([{ match: (c) => c.method === "DELETE" && c.url.pathname === "/v9/projects/prj_abc123/domains/brand.in", status: 200, json: {} }]);
    await removeProjectDomain(cfg(f.impl), "brand.in");
    expect(f.calls[0]!.body).toEqual({ removeRedirects: true });
    await expect(removeProjectDomain(cfg(fakeFetch([]).impl), "gone.in")).resolves.toBeUndefined();
  });

  it("marks network failures and 5xx as transient, 4xx as not", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await getDomainConfig(cfg(boom), "brand.in").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VercelApiError);
    expect((err as VercelApiError).transient).toBe(true);
    expect(new VercelApiError("x", 503).transient).toBe(true);
    expect(new VercelApiError("x", 409).transient).toBe(false);
  });

  it("inspect: verifies when needed, maps state and lists challenge + routing records", async () => {
    const f = fakeFetch([
      { match: (c) => c.method === "GET" && c.url.pathname === "/v9/projects/prj_abc123/domains/brand.in", status: 200, json: domain("brand.in", { verified: false, verification: [{ type: "TXT", domain: "_vercel.brand.in", value: "vc", reason: "r" }] }) },
      { match: (c) => c.method === "POST" && c.url.pathname.endsWith("/verify"), status: 400, json: { error: { code: "missing_txt_record" } } },
      { match: (c) => c.url.pathname === "/v6/domains/brand.in/config", status: 200, json: config() },
    ]);
    const s = await inspectProjectDomain(cfg(f.impl), "brand.in");
    expect(s?.state).toBe("verifying");
    expect(s?.records.map((r) => r.type)).toEqual(["TXT", "A"]);
    expect(await inspectProjectDomain(cfg(fakeFetch([]).impl), "missing.in")).toBeNull();
  });

  it("inspect: active only with verified + misconfigured false", async () => {
    const f = fakeFetch([
      { match: (c) => c.method === "GET" && c.url.pathname.startsWith("/v9/"), status: 200, json: domain("www.brand.in") },
      { match: (c) => c.url.pathname.startsWith("/v6/"), status: 200, json: config({ misconfigured: false, configuredBy: "CNAME" }) },
    ]);
    const s = await inspectProjectDomain(cfg(f.impl), "www.brand.in");
    expect(s?.state).toBe("active");
    expect(f.calls.some((c) => c.url.pathname.endsWith("/verify"))).toBe(false);
  });
});

describe("stored DNS records + messages", () => {
  it("drops malformed entries and duplicates", () => {
    const good = { type: "A", name: "brand.in", value: "1.2.3.4", purpose: "routing" };
    expect(parseStoredDnsRecords([good, good, { type: "MX", name: "x", value: "y", purpose: "routing" }, "junk"])).toEqual([good]);
    expect(parseStoredDnsRecords(null)).toEqual([]);
  });
  it("has a message for every non-active state", () => {
    expect(vercelStateMessage("active")).toBeNull();
    for (const s of ["verifying", "pending_dns", "misconfigured"] as const) expect(vercelStateMessage(s)).toBeTruthy();
  });
});
