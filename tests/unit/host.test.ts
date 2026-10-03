import { describe, expect, it } from "vitest";
import { classifyHost, isValidStoreSlug, normalizeHost } from "@/lib/tenant/host";

const ROOT = "paliya.store";

describe("normalizeHost", () => {
  it.each([
    ["Acme.Paliya.Store", "acme.paliya.store"],
    ["acme.paliya.store:3000", "acme.paliya.store"],
    ["www.brand.com.", "www.brand.com"],
    ["localhost:3000", "localhost"],
  ])("normalises %s", (input, expected) => expect(normalizeHost(input)).toBe(expected));

  it.each([null, "", "127.0.0.1", "[::1]:3000", "a..b.com", "-bad.com", "bad-.com", "host:abc", "exa mple.com", "a".repeat(64) + ".com", "évil.com"])(
    "rejects %s",
    (input) => expect(normalizeHost(input)).toBeNull(),
  );
});

describe("classifyHost", () => {
  it("recognises the platform root and www", () => {
    expect(classifyHost("paliya.store", ROOT).kind).toBe("platform");
    expect(classifyHost("www.paliya.store", ROOT).kind).toBe("platform");
  });

  it("extracts a store slug from a single-level subdomain", () => {
    expect(classifyHost("jaipur-looms.paliya.store", ROOT)).toEqual({
      kind: "store-subdomain",
      host: "jaipur-looms.paliya.store",
      slug: "jaipur-looms",
    });
  });

  it("marks reserved subdomains", () => {
    expect(classifyHost("admin.paliya.store", ROOT).kind).toBe("reserved");
    expect(classifyHost("api.paliya.store", ROOT).kind).toBe("reserved");
  });

  it("rejects nested subdomains of the root", () => {
    expect(classifyHost("a.b.paliya.store", ROOT).kind).toBe("invalid");
  });

  it("does not treat look-alike suffixes as the platform", () => {
    expect(classifyHost("evilpaliya.store", ROOT).kind).toBe("custom-domain");
    expect(classifyHost("paliya.store.evil.com", ROOT).kind).toBe("custom-domain");
  });

  it("treats other dotted hosts as candidate custom domains (resolved against verified domains later)", () => {
    expect(classifyHost("www.brand.in", ROOT)).toEqual({ kind: "custom-domain", host: "www.brand.in" });
  });

  it("rejects IPs and bare labels", () => {
    expect(classifyHost("10.0.0.1", ROOT).kind).toBe("invalid");
    expect(classifyHost("intranet", ROOT).kind).toBe("invalid");
  });

  it("supports localhost as a dev root domain", () => {
    expect(classifyHost("localhost:3000", "localhost").kind).toBe("platform");
    expect(classifyHost("acme.localhost:3000", "localhost")).toMatchObject({ kind: "store-subdomain", slug: "acme" });
  });
});

describe("isValidStoreSlug", () => {
  it.each(["acme", "jaipur-looms", "a1b"])("accepts %s", (s) => expect(isValidStoreSlug(s)).toBe(true));
  it.each(["ab", "admin", "www", "-acme", "acme-", "ac--me", "Acme", "a_b"])("rejects %s", (s) =>
    expect(isValidStoreSlug(s)).toBe(false),
  );
});
