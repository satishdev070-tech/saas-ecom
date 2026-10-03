import { describe, expect, it } from "vitest";
import { buildLocalPost, parseLocation, parseReview, POST_SUMMARY_MAX, reviewLink, reviewStats, scoreCompleteness, utf8Bytes, v4LocationName, whatsappShareLink, type GbpLocation, type StoreProfile } from "@/features/google-business/gbp";

describe("buildLocalPost (v4 LocalPost payload)", () => {
  it("maps caption, photo and link to a STANDARD post with LEARN_MORE", () => {
    expect(buildLocalPost({ caption: "  New kurtas are in!  ", link: "https://shop.example/kurtas?utm_source=google", imageUrl: "https://cdn.example/a.jpg" })).toEqual({
      languageCode: "en-IN",
      topicType: "STANDARD",
      summary: "New kurtas are in!",
      media: [{ mediaFormat: "PHOTO", sourceUrl: "https://cdn.example/a.jpg" }],
      callToAction: { actionType: "LEARN_MORE", url: "https://shop.example/kurtas?utm_source=google" },
    });
  });

  it("omits media and call to action when absent or unsafe", () => {
    const body = buildLocalPost({ caption: "Hello", link: null, imageUrl: "http://insecure/a.jpg" });
    expect(body.media).toBeUndefined();
    expect(body.callToAction).toBeUndefined();
    expect(buildLocalPost({ caption: "x", link: "javascript:alert(1)", imageUrl: null }).callToAction).toBeUndefined();
  });

  it("truncates the summary to Google's 1,500 characters", () => {
    const s = buildLocalPost({ caption: "a".repeat(2000), link: null, imageUrl: null }).summary;
    expect(s).toHaveLength(POST_SUMMARY_MAX);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("parseReview", () => {
  it("parses a v4 review with a reply", () => {
    expect(
      parseReview({
        name: "accounts/1/locations/2/reviews/abc",
        reviewId: "abc",
        reviewer: { displayName: "Asha", isAnonymous: false },
        starRating: "FOUR",
        comment: "Lovely fabric",
        createTime: "2026-09-01T10:00:00Z",
        updateTime: "2026-09-02T10:00:00Z",
        reviewReply: { comment: "Thank you!", updateTime: "2026-09-03T10:00:00Z" },
      }),
    ).toEqual({ reviewId: "abc", reviewerName: "Asha", starRating: 4, comment: "Lovely fabric", reply: "Thank you!", repliedAt: "2026-09-03T10:00:00.000Z", reviewTime: "2026-09-01T10:00:00.000Z" });
  });

  it("handles anonymous, rating-only and malformed reviews", () => {
    const r = parseReview({ name: "accounts/1/locations/2/reviews/xyz", reviewer: { displayName: "Hidden", isAnonymous: true }, starRating: "STAR_RATING_UNSPECIFIED" });
    expect(r).toMatchObject({ reviewId: "xyz", reviewerName: null, starRating: null, comment: null, reply: null });
    expect(parseReview({})).toBeNull();
    expect(parseReview(null)).toBeNull();
  });

  it("counts reply length in bytes (Google's 4,096-byte limit)", () => {
    expect(utf8Bytes("नमस्ते")).toBe(18);
  });
});

describe("reviewStats", () => {
  it("computes average, unreplied and star counts", () => {
    const s = reviewStats([
      { star_rating: 5, reply: "thanks" },
      { star_rating: 4, reply: null },
      { star_rating: 1, reply: null },
      { star_rating: null, reply: null },
    ]);
    expect(s).toEqual({ count: 4, average: 3.3, unreplied: 3, byStar: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 } });
    expect(reviewStats([]).average).toBeNull();
  });
});

const store: StoreProfile = {
  name: "Aangan Crafts",
  address: { line1: "12 MG Road", city: "Jaipur", state: "RJ", postal_code: "302001" },
  phone: "+91 98290 12345",
  hours: "10am–8pm",
  description: "Handmade block prints",
  category: "Clothing",
  website: "https://aangan.example",
  photos: 4,
};

describe("parseLocation + scoreCompleteness", () => {
  const raw = {
    name: "locations/555",
    title: "Aangan Crafts",
    phoneNumbers: { primaryPhone: "098290 12345" },
    storefrontAddress: { addressLines: ["12 MG Road"], locality: "Jaipur", administrativeArea: "RJ", postalCode: "302001", regionCode: "IN" },
    regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 10 }, closeDay: "MONDAY", closeTime: { hours: 20 } }] },
    profile: { description: "Block prints from Jaipur" },
    categories: { primaryCategory: { name: "categories/gcid:clothing_store", displayName: "Clothing store" } },
    websiteUri: "https://www.aangan.example/",
    metadata: { placeId: "ChIJ1234567890abc", mapsUri: "https://maps.google.com/?cid=1" },
  };

  it("parses the Business Information location", () => {
    const loc = parseLocation(raw)!;
    expect(loc).toMatchObject({ name: "locations/555", title: "Aangan Crafts", address: "12 MG Road, Jaipur, RJ, 302001", postalCode: "302001", phone: "098290 12345", hasHours: true, primaryCategory: "Clothing store", placeId: "ChIJ1234567890abc" });
    expect(parseLocation({ name: "accounts/1" })).toBeNull();
  });

  it("scores 100 when everything is on Google and consistent", () => {
    const loc: GbpLocation = { ...parseLocation(raw)!, photoCount: 12 };
    const r = scoreCompleteness(store, loc);
    expect(r.items.every((i) => i.state === "ok")).toBe(true);
    expect(r.score).toBe(100);
  });

  it("flags gaps and mismatches", () => {
    const loc: GbpLocation = { ...parseLocation(raw)!, phone: "+91 11111 22222", description: null, websiteUri: "https://other.example", photoCount: 0 };
    const r = scoreCompleteness(store, loc);
    const state = Object.fromEntries(r.items.map((i) => [i.key, i.state]));
    expect(state).toMatchObject({ name: "ok", address: "ok", phone: "mismatch", description: "gap", website: "mismatch", photos: "gap", hours: "ok", categories: "ok" });
    expect(r.score).toBe(50);
  });

  it("without a location lists what to prepare (score 0)", () => {
    const r = scoreCompleteness({ ...store, phone: null }, null);
    expect(r.score).toBe(0);
    expect(r.items.find((i) => i.key === "phone")!.state).toBe("store_missing");
    expect(r.items.find((i) => i.key === "name")!.state).toBe("pending");
  });
});

describe("review links", () => {
  it("builds the writereview link from a place id and a WhatsApp share", () => {
    const link = reviewLink("ChIJ1234567890abc")!;
    expect(link).toBe("https://search.google.com/local/writereview?placeid=ChIJ1234567890abc");
    expect(reviewLink("bad id<script>")).toBeNull();
    expect(reviewLink(null)).toBeNull();
    expect(whatsappShareLink("Aangan", link)).toMatch(/^https:\/\/wa\.me\/\?text=.*writereview/);
  });

  it("builds v4 location names only from well-formed parts", () => {
    expect(v4LocationName("accounts/1", "locations/2")).toBe("accounts/1/locations/2");
    expect(v4LocationName("accounts/1/../x", "locations/2")).toBeNull();
  });
});
