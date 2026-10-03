import { describe, expect, it } from "vitest";
import { shippingRateSchema, storeDetailsSchema, codSettingsSchema } from "@/features/settings/schemas";
import { rateForUnitPrice, readTaxSettings, taxSettingsSchema, DEFAULT_TAX_SETTINGS } from "@/features/settings/tax";
import { DEFAULT_TEMPLATES, renderTemplate, SAMPLE_VALUES, TEMPLATE_KEYS, unknownPlaceholders } from "@/features/settings/notification-templates";
import { tagList } from "@/features/settings/fields";
import { addressLines, refundableMinor, sanitizeSearch } from "@/features/orders-admin/format";

describe("storeDetailsSchema", () => {
  it("validates analytics IDs and normalises contact fields", () => {
    const r = storeDetailsSchema.parse({ name: "Aangan", phone: "98765 43210", gstin: "08abcde1234f1z5", email: "Hi@Aangan.In" });
    expect(r.phone).toBe("+919876543210");
    expect(r.gstin).toBe("08ABCDE1234F1Z5");
    expect(r.email).toBe("hi@aangan.in");
    expect(r.orderPrefix).toBe("#");
    expect(r.lowStockDefault).toBe(5);
  });

  it("rejects malformed IDs and non-https social links", () => {
    const r = storeDetailsSchema.safeParse({ name: "Aangan", instagram: "http://instagram.com/x", facebook: "javascript:alert(1)" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["instagram", "facebook"]));
  });
});

describe("shippingRateSchema", () => {
  it("parses rupees and PIN prefixes", () => {
    const r = shippingRateSchema.parse({ name: "Standard", price: "79", minSubtotal: "0", maxSubtotal: "999", pincodePrefixes: "30, 31 110", active: "on" });
    expect(r.price).toBe(7900);
    expect(r.maxSubtotal).toBe(99900);
    expect(r.pincodePrefixes).toEqual(["30", "31", "110"]);
    expect(r.active).toBe(true);
    expect(r.codAllowed).toBe(false);
  });

  it("rejects inverted ranges and bad prefixes", () => {
    expect(shippingRateSchema.safeParse({ name: "x", minSubtotal: "1000", maxSubtotal: "500" }).success).toBe(false);
    expect(shippingRateSchema.safeParse({ name: "x", pincodePrefixes: "0123" }).success).toBe(false);
    expect(shippingRateSchema.safeParse({ name: "x", daysMin: "5", daysMax: "2" }).success).toBe(false);
  });
});

describe("payments", () => {

  it("validates COD limits", () => {
    expect(codSettingsSchema.parse({ enabled: "on", fee: "49", minOrder: "0", maxOrder: "0" }).fee).toBe(4900);
    expect(codSettingsSchema.safeParse({ minOrder: "5000", maxOrder: "1000" }).success).toBe(false);
  });
});

describe("tax slabs", () => {
  it("accepts the apparel default and picks rates by unit price", () => {
    const s = taxSettingsSchema.parse(DEFAULT_TAX_SETTINGS);
    expect(rateForUnitPrice(s, 250000)).toBe(5);
    expect(rateForUnitPrice(s, 250001)).toBe(18);
  });

  it("requires a catch-all last slab and increasing limits", () => {
    expect(taxSettingsSchema.safeParse({ prices_include_tax: true, rules: [{ max_unit_price: 1000, rate: 5 }] }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ prices_include_tax: true, rules: [{ rate: 5 }, { rate: 18 }] }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ prices_include_tax: true, rules: [{ max_unit_price: 2000, rate: 5 }, { max_unit_price: 1000, rate: 12 }, { rate: 18 }] }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ prices_include_tax: true, rules: [{ rate: 7 }] }).success).toBe(false);
    expect(readTaxSettings({ junk: true })).toEqual(DEFAULT_TAX_SETTINGS);
  });
});

describe("notification templates", () => {
  it("renders known placeholders and leaves unknown ones", () => {
    expect(renderTemplate("Hi {{ customer_name }}, order {{order_number}} {{nope}}", { customer_name: "Neha", order_number: "#1" })).toBe("Hi Neha, order #1 {{nope}}");
    expect(unknownPlaceholders("{{customer_name}} {{custmer}} {{custmer}}")).toEqual(["custmer"]);
  });

  it("every default template uses only known placeholders", () => {
    for (const k of TEMPLATE_KEYS) {
      const t = DEFAULT_TEMPLATES[k];
      expect(unknownPlaceholders(t.subject + t.body)).toEqual([]);
      expect(renderTemplate(t.body, SAMPLE_VALUES)).not.toMatch(/\{\{/);
    }
  });
});

describe("misc helpers", () => {
  it("tagList normalises tags", () => {
    expect(tagList().parse("VIP, jaipur,vip,\n wholesale ")).toEqual(["vip", "jaipur", "wholesale"]);
    expect(tagList().parse(undefined)).toEqual([]);
  });

  it("sanitizeSearch strips PostgREST metacharacters", () => {
    expect(sanitizeSearch("a,b(c)*'\"\\d")).toEqual({ text: "abcd", digits: "", orderNumber: null });
    expect(sanitizeSearch("#1042")?.orderNumber).toBe(1042);
    expect(sanitizeSearch("98765 43210")?.digits).toBe("9876543210");
    expect(sanitizeSearch("   ")).toBeNull();
  });

  it("refundableMinor only for paid orders", () => {
    expect(refundableMinor({ grand_total: 1000, refunded_total: 250.5, payment_status: "partially_refunded" })).toBe(74950);
    expect(refundableMinor({ grand_total: 1000, refunded_total: 0, payment_status: "cod_pending" })).toBe(0);
  });

  it("addressLines ignores non-string values", () => {
    expect(addressLines({ name: "Neha", line1: "12 MI Road", city: "Jaipur", state: "RJ", postal_code: "302001", phone: "+919000000001", evil: { x: 1 } })).toEqual([
      "Neha",
      "12 MI Road",
      "Jaipur, RJ – 302001",
      "+919000000001",
    ]);
    expect(addressLines(null)).toEqual([]);
  });
});
