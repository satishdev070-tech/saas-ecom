import { describe, expect, it } from "vitest";
import { buildOriginRequest, normalizeHost } from "../../workers/domain-router/src/index";
import { verifyEdgeHost } from "@/lib/tenant/edge-signature";

const env = { ORIGIN_URL: "https://origin.paliya.store", EDGE_SHARED_SECRET: "s".repeat(40) };

describe("domain-router worker", () => {
  it("signs the customer host so the app verifier accepts it", async () => {
    const req = new Request("https://Shop.Brand.in/products/x?y=1", { headers: { "x-paliya-edge-host": "evil.example", "x-paliya-host": "evil" } });
    const out = await buildOriginRequest(req, env, 1_800_000_000);
    expect(out).toBeInstanceOf(Request);
    const r = out as Request;
    expect(r.url).toBe("https://origin.paliya.store/products/x?y=1");
    expect(r.headers.get("x-paliya-host")).toBeNull();
    expect(r.headers.get("x-paliya-edge-host")).toBe("shop.brand.in");
    const ok = await verifyEdgeHost({ secret: env.EDGE_SHARED_SECRET, host: "shop.brand.in", ts: r.headers.get("x-paliya-edge-ts"), signature: r.headers.get("x-paliya-edge-sig"), nowSeconds: 1_800_000_010 });
    expect(ok).toBe(true);
  });
  it("refuses bad hosts and missing config", async () => {
    expect(normalizeHost("localhost")).toBeNull();
    expect(normalizeHost("a.b.c:443")).toBe("a.b.c");
    const res = await buildOriginRequest(new Request("https://shop.brand.in/"), { ...env, EDGE_SHARED_SECRET: "short" });
    expect((res as Response).status).toBe(503);
  });
});
