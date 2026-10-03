import { describe, expect, it } from "vitest";
import { META_EVENT, attributionFromSearch, itemsValue, parseAttribution, toMetaParams } from "@/features/tracking/items";

describe("campaign attribution", () => {
  it("captures UTM and click ids from the landing URL", () => {
    const a = attributionFromSearch(new URLSearchParams("utm_source=instagram&utm_medium=paid_social&utm_campaign=diwali-26&fbclid=IwAR0abc&x=1"), "/products/kurta", new Date("2026-09-26T00:00:00Z"));
    expect(a).toEqual({ utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "diwali-26", fbclid: "IwAR0abc", landing_path: "/products/kurta", first_seen: "2026-09-26T00:00:00.000Z" });
    expect(attributionFromSearch(new URLSearchParams("q=saree"), "/search")).toBeNull();
  });

  it("sanitises untrusted cookie values before they reach an order", () => {
    const raw = encodeURIComponent(JSON.stringify({ utm_source: "<script>alert(1)</script>", utm_campaign: "a".repeat(500), landing_path: "https://evil.test", email: "x@y.z", first_seen: "nope" }));
    const a = parseAttribution(raw)!;
    expect(a.utm_source).toBe("scriptalert1/script");
    expect(a.utm_campaign).toHaveLength(150);
    expect(a.landing_path).toBeUndefined();
    expect(a.first_seen).toBeUndefined();
    expect(a).not.toHaveProperty("email");
    expect(parseAttribution("not json")).toBeNull();
    expect(parseAttribution(encodeURIComponent("{}"))).toBeNull();
    expect(parseAttribution("x".repeat(3000))).toBeNull();
  });
});

describe("event mapping", () => {
  const items = [
    { item_id: "K1", item_name: "Kurta", price: 1249.5, quantity: 2 },
    { item_id: "D1", item_name: "Dupatta", price: 499, quantity: 1 },
  ];
  it("sums item value in rupees", () => expect(itemsValue(items)).toBe(2998));
  it("maps GA4 events to Meta standard events", () => {
    expect(META_EVENT.purchase).toBe("Purchase");
    expect(META_EVENT.begin_checkout).toBe("InitiateCheckout");
    expect(META_EVENT.view_item_list).toBeNull();
    expect(toMetaParams({ value: 2998, items })).toMatchObject({ value: 2998, currency: "INR", content_ids: ["K1", "D1"], content_type: "product", num_items: 3 });
    expect(toMetaParams({ search_term: "saree" })).toEqual({ search_string: "saree" });
  });
});
