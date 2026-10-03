import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_CONFIG, brandImageUrl, isIco, parseBrandImage, parseGa4Id, parsePublicConfig } from "@/features/platform/public-config";
import { parseSettingValue } from "@/features/platform/settings-registry";
import { parseCheckoutOptions, checkoutOptionsSchema, toCheckoutSettingsJson } from "@/features/checkout/options";
import { mapNominatimAddress, matchIndianState, nominatimReverseUrl, parseCoordinates } from "@/features/geo/reverse";
import { FROM_RE, resolveCredential, saveAppCredentialSchema } from "@/features/platform-apps/core";

const PATH = "branding/header_logo/0b9e7c2a-3f7e-4b55-9f43-2b0c8d1a7e11.png";

describe("public platform config", () => {
  it("defaults to today's behaviour when nothing is saved", () => {
    expect(parsePublicConfig([])).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(DEFAULT_PUBLIC_CONFIG).toMatchObject({ googleForSellers: true, googleForShoppers: true, locationAutofill: true, ga4Id: null, headerLogo: null });
  });

  it("reads logos, GA4 id and switches, ignoring malformed values", () => {
    const c = parsePublicConfig([
      { key: "public.brand.header_logo", value: { path: PATH, width: 320, height: 64 } },
      { key: "public.brand.footer_logo", value: { path: "https://evil.example/x.png" } },
      { key: "public.analytics.ga4_id", value: "g-ab12cd34ef" },
      { key: "public.auth.google_shoppers", value: false },
      { key: "public.checkout.location_autofill", value: "no" },
    ]);
    expect(c.headerLogo).toEqual({ path: PATH, width: 320, height: 64 });
    expect(c.footerLogo).toBeNull();
    expect(c.ga4Id).toBe("G-AB12CD34EF");
    expect(c.googleForShoppers).toBe(false);
    expect(c.googleForSellers).toBe(true);
    expect(c.locationAutofill).toBe(true);
  });

  it("only accepts paths this feature writes", () => {
    expect(parseBrandImage({ path: "branding/favicon/../../x.png" })).toBeNull();
    expect(parseBrandImage({ path: PATH.replace(".png", ".svg") })).toBeNull();
    expect(parseBrandImage({ path: PATH, width: -1 })).toEqual({ path: PATH, width: null, height: null });
    expect(brandImageUrl("https://abc.supabase.co/", { path: PATH, width: null, height: null })).toBe(`https://abc.supabase.co/storage/v1/object/public/platform-branding/${PATH}`);
  });

  it("validates the GA4 measurement id in the settings registry", () => {
    expect(parseGa4Id("UA-12345-1")).toBeNull();
    expect(parseSettingValue("public.analytics.ga4_id", " g-ab12cd34ef ")).toEqual({ ok: true, value: "G-AB12CD34EF" });
    expect(parseSettingValue("public.analytics.ga4_id", "")).toEqual({ ok: true, value: null });
    expect(parseSettingValue("public.analytics.ga4_id", "<script>").ok).toBe(false);
    expect(parseSettingValue("public.auth.google_sellers", undefined)).toEqual({ ok: true, value: false });
  });

  it("recognises .ico favicons by their header", () => {
    expect(isIco(new Uint8Array([0, 0, 1, 0, 1, 0]))).toBe(true);
    expect(isIco(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe(false);
  });
});

describe("store checkout options", () => {
  it("defaults to guest checkout and location autofill on", () => {
    expect(parseCheckoutOptions(null)).toEqual({ guestCheckout: true, locationAutofill: true });
    expect(parseCheckoutOptions({ guest_checkout: false })).toEqual({ guestCheckout: false, locationAutofill: true });
  });
  it("round-trips the dashboard form", () => {
    const v = checkoutOptionsSchema.parse({ locationAutofill: "true" });
    expect(v).toEqual({ guestCheckout: false, locationAutofill: true });
    expect(toCheckoutSettingsJson(v)).toEqual({ guest_checkout: false, location_autofill: true });
  });
});

describe("location autofill (reverse geocoding)", () => {
  it("validates and rounds coordinates", () => {
    expect(parseCoordinates("12.971598", "77.594566")).toEqual({ lat: 12.9716, lon: 77.5946 });
    expect(parseCoordinates("91", "0")).toBeNull();
    expect(parseCoordinates("", "1")).toBeNull();
    expect(parseCoordinates("abc", "1")).toBeNull();
    expect(nominatimReverseUrl(12.9716, 77.5946)).toBe("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=12.9716&lon=77.5946&zoom=18&addressdetails=1&accept-language=en");
  });

  it("maps an Indian address onto the checkout fields", () => {
    const r = mapNominatimAddress({ address: { road: "MG Road", suburb: "Shanthala Nagar", city: "Bengaluru", state: "Karnataka", postcode: "560 001", country_code: "in" } });
    expect(r).toEqual({ ok: true, address: { line2: "MG Road, Shanthala Nagar", city: "Bengaluru", state: "Karnataka", postalCode: "560001" } });
    expect(mapNominatimAddress({ address: { town: "Mapusa", state: "Goa", postcode: "ABC", country_code: "in" } })).toEqual({ ok: true, address: { line2: null, city: "Mapusa", state: "Goa", postalCode: null } });
  });

  it("refuses addresses outside India and unknown responses", () => {
    expect(mapNominatimAddress({ address: { city: "London", country_code: "gb" } })).toEqual({ ok: false, reason: "outside_india" });
    expect(mapNominatimAddress({ error: "Unable to geocode" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("normalises state names", () => {
    expect(matchIndianState("NCT of Delhi")).toBe("Delhi");
    expect(matchIndianState("tamil nadu")).toBe("Tamil Nadu");
    expect(matchIndianState("Bavaria")).toBeNull();
  });
});

describe("Resend platform credential", () => {
  it("prefers the console key and From, falling back to env", () => {
    const env = { RESEND_API_KEY: "re_env_key_123456", EMAIL_FROM: "Env <no-reply@env.example.in>" };
    const fromEnv = resolveCredential("resend", null, (c) => c, env);
    expect(fromEnv).toMatchObject({ secret: "re_env_key_123456", source: "env", extra: { from: "Env <no-reply@env.example.in>" } });
    const fromDb = resolveCredential("resend", { client_id: null, secret_ciphertext: "re_db_key_1234567", extra: { from: "BB <no-reply@mail.bb.in>", other: "x" } }, (c) => c, env);
    expect(fromDb).toMatchObject({ secret: "re_db_key_1234567", source: "db", extra: { from: "BB <no-reply@mail.bb.in>" } });
    expect(fromDb?.extra).not.toHaveProperty("other");
  });

  it("validates the From mailbox (header-safe)", () => {
    expect(saveAppCredentialSchema.parse({ provider: "resend", from: "Build Brighten <no-reply@mail.buildbrighten.in>" }).from).toBe("Build Brighten <no-reply@mail.buildbrighten.in>");
    expect(FROM_RE.test("Evil\r\nBcc: x <a@b.co>")).toBe(false);
    expect(FROM_RE.test("a@b")).toBe(false);
    expect(saveAppCredentialSchema.safeParse({ provider: "resend", from: "nope" }).success).toBe(false);
  });
});
