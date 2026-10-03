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
});
