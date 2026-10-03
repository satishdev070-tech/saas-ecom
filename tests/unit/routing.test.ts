import { describe, expect, it } from "vitest";
import { decideRoute } from "@/lib/tenant/routing";

const ROOT = "paliya.store";

describe("decideRoute", () => {
  it("passes platform requests through", () => {
    expect(decideRoute("paliya.store", "/dashboard", ROOT).action).toBe("next");
  });

  it("blocks direct access to the internal storefront namespace from the platform host", () => {
    expect(decideRoute("paliya.store", "/store/other.com/products/x", ROOT).action).toBe("not-found");
    expect(decideRoute("paliya.store", "/store", ROOT).action).toBe("not-found");
  });

  it("does not block platform paths that merely start with the word store", () => {
    expect(decideRoute("paliya.store", "/stores-we-love", ROOT).action).toBe("next");
  });

  it("rewrites storefront subdomains into /store/[host]", () => {
    expect(decideRoute("acme.paliya.store", "/", ROOT)).toMatchObject({ action: "rewrite", pathname: "/store/acme.paliya.store" });
    expect(decideRoute("acme.paliya.store", "/products/red-kurta", ROOT)).toMatchObject({
      action: "rewrite",
      pathname: "/store/acme.paliya.store/products/red-kurta",
    });
  });

  it("rewrites custom domains the same way", () => {
    expect(decideRoute("www.brand.in", "/collections/sarees", ROOT)).toMatchObject({
      action: "rewrite",
      pathname: "/store/www.brand.in/collections/sarees",
    });
  });

  it("keeps a smuggled /store path inside the requesting tenant's namespace", () => {
    expect(decideRoute("acme.paliya.store", "/store/victim.com", ROOT)).toMatchObject({
      pathname: "/store/acme.paliya.store/store/victim.com",
    });
  });

  it("hides seller/platform routes on storefront hosts", () => {
    expect(decideRoute("acme.paliya.store", "/dashboard", ROOT).action).toBe("not-found");
    expect(decideRoute("www.brand.in", "/admin/tenants", ROOT).action).toBe("not-found");
  });

  it("lets API and framework paths through on storefront hosts", () => {
    expect(decideRoute("acme.paliya.store", "/api/cart", ROOT).action).toBe("next");
  });

  it("404s reserved and invalid hosts", () => {
    expect(decideRoute("admin.paliya.store", "/", ROOT).action).toBe("not-found");
    expect(decideRoute(null, "/", ROOT).action).toBe("not-found");
    expect(decideRoute("127.0.0.1", "/", ROOT).action).toBe("not-found");
  });

  describe("with a Vercel production alias as an extra platform host", () => {
    const ALIASES = ["saas-ecom-puce.vercel.app"];

    it("serves the platform homepage and app routes on the alias", () => {
      expect(decideRoute("saas-ecom-puce.vercel.app", "/", ROOT, ALIASES)).toMatchObject({ action: "next", classification: { kind: "platform" } });
      expect(decideRoute("saas-ecom-puce.vercel.app", "/login", ROOT, ALIASES).action).toBe("next");
      expect(decideRoute("saas-ecom-puce.vercel.app", "/dashboard", ROOT, ALIASES).action).toBe("next");
      expect(decideRoute("saas-ecom-puce.vercel.app", "/api/health", ROOT, ALIASES).action).toBe("next");
    });

    it("keeps the internal storefront namespace closed on the alias", () => {
      expect(decideRoute("saas-ecom-puce.vercel.app", "/store/acme.paliya.store", ROOT, ALIASES).action).toBe("not-found");
    });

    it("is the bug being fixed: without the alias the host is treated as a store domain", () => {
      expect(decideRoute("saas-ecom-puce.vercel.app", "/", ROOT)).toMatchObject({ action: "rewrite", pathname: "/store/saas-ecom-puce.vercel.app" });
    });

    it("does not trust other vercel.app hosts", () => {
      expect(decideRoute("someone-else.vercel.app", "/", ROOT, ALIASES)).toMatchObject({ action: "rewrite", pathname: "/store/someone-else.vercel.app" });
      expect(decideRoute("x.saas-ecom-puce.vercel.app", "/", ROOT, ALIASES).classification.kind).toBe("custom-domain");
    });

    it("leaves store subdomains and custom domains unchanged", () => {
      expect(decideRoute("acme.paliya.store", "/", ROOT, ALIASES)).toMatchObject({ action: "rewrite", pathname: "/store/acme.paliya.store" });
      expect(decideRoute("www.brand.in", "/products/x", ROOT, ALIASES)).toMatchObject({ action: "rewrite", pathname: "/store/www.brand.in/products/x" });
      expect(decideRoute("www.brand.in", "/dashboard", ROOT, ALIASES).action).toBe("not-found");
    });
  });
});
