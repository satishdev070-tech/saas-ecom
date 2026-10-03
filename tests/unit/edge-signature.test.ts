import { describe, expect, it } from "vitest";
import { signEdgeHost, verifyEdgeHost } from "@/lib/tenant/edge-signature";

const SECRET = "x".repeat(40);
const NOW = 1_800_000_000;

describe("edge host signature", () => {
  it("accepts a fresh, correctly signed host", async () => {
    const signature = await signEdgeHost(SECRET, "www.brand.in", NOW);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.brand.in", ts: String(NOW), signature, nowSeconds: NOW + 10 })).toBe(true);
  });

  it("rejects a signature for a different host", async () => {
    const signature = await signEdgeHost(SECRET, "www.brand.in", NOW);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.victim.in", ts: String(NOW), signature, nowSeconds: NOW })).toBe(false);
  });

  it("rejects stale signatures", async () => {
    const signature = await signEdgeHost(SECRET, "www.brand.in", NOW);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.brand.in", ts: String(NOW), signature, nowSeconds: NOW + 301 })).toBe(false);
  });

  it("rejects when no secret is configured or headers are missing/malformed", async () => {
    const signature = await signEdgeHost(SECRET, "www.brand.in", NOW);
    expect(await verifyEdgeHost({ secret: undefined, host: "www.brand.in", ts: String(NOW), signature, nowSeconds: NOW })).toBe(false);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.brand.in", ts: null, signature, nowSeconds: NOW })).toBe(false);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.brand.in", ts: String(NOW), signature: "zz", nowSeconds: NOW })).toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    const signature = await signEdgeHost("y".repeat(40), "www.brand.in", NOW);
    expect(await verifyEdgeHost({ secret: SECRET, host: "www.brand.in", ts: String(NOW), signature, nowSeconds: NOW })).toBe(false);
  });
});
