import { describe, expect, it } from "vitest";
import { PROVIDERS, maskSecret, providersOfKind, validateCredentials } from "@/features/integrations/registry";
import { buildDelhiveryShipment, parseDelhiveryCreate, parseDelhiveryServiceability } from "@/features/shipping/delhivery-format";
import type { ShipmentOrder } from "@/features/shipping/types";

const none = { hasSecrets: {}, public: {} };

describe("integration registry", () => {
  it("groups providers by kind", () => {
    expect(providersOfKind("payment").map((p) => p.id)).toEqual(["razorpay", "cashfree", "payu"]);
    expect(providersOfKind("shipping").map((p) => p.id)).toEqual(["shiprocket", "delhivery"]);
    expect(providersOfKind("tracking").map((p) => p.id)).toEqual(["ga4", "google_ads", "meta_pixel"]);
  });

  it("requires every mandatory field and validates formats", () => {
    expect(Object.keys(validateCredentials(PROVIDERS.razorpay, {}, none))).toEqual(["key_id", "key_secret"]);
    expect(validateCredentials(PROVIDERS.razorpay, { key_id: "pk_live_123", key_secret: "s" }, none).key_id?.[0]).toMatch(/rzp_test/);
    expect(validateCredentials(PROVIDERS.razorpay, { key_id: "rzp_test_ABCDEFGH12", key_secret: "s" }, none)).toEqual({});
    expect(validateCredentials(PROVIDERS.ga4, { measurement_id: "UA-1234-1" }, none).measurement_id).toBeDefined();
    expect(validateCredentials(PROVIDERS.meta_pixel, { pixel_id: "123456789012345" }, none)).toEqual({});
    expect(validateCredentials(PROVIDERS.delhivery, { api_token: "t", pickup_location: "WH", pickup_postcode: "012345" }, none).pickup_postcode).toBeDefined();
  });

  it("treats a blank secret as 'keep the saved one'", () => {
    const stored = { hasSecrets: { key_secret: true }, public: { key_id: "rzp_live_ABCDEFGH12" } };
    expect(validateCredentials(PROVIDERS.razorpay, { key_id: "", key_secret: "" }, stored)).toEqual({});
  });

  it("never shows more than the last four characters", () => {
    expect(maskSecret("a1b2")).toBe("•••• a1b2");
    expect(maskSecret(null)).toBe("Not set");
  });
});

const order: ShipmentOrder = {
  orderId: "5b0f1c1e-0000-4000-a000-000000000001",
  orderNumber: "AAN-1042",
  placedAt: "2026-09-20T10:00:00.000Z",
  paymentMethod: "cod",
  grandTotal: 249900,
  subtotal: 249900,
  discountTotal: 0,
  shippingTotal: 0,
  email: "a@b.in",
  phone: "+919876543210",
  address: { name: "Asha", phone: "+91 98765-43210", line1: "12 MG Road", line2: null, landmark: "Near park", city: "Jaipur", state: "Rajasthan", postal_code: "302001" },
  items: [{ title: "Kurta", sku: "K1", quantity: 2, unitPrice: 124950, hsn: "6204" }],
  weightGrams: 40,
};

describe("Delhivery mapping", () => {
  it("builds a COD shipment with rupee amounts and a 10-digit phone", () => {
    const s = buildDelhiveryShipment(order, "Main WH").shipments[0]!;
    expect(s).toMatchObject({ payment_mode: "COD", cod_amount: "2499.00", total_amount: "2499.00", phone: "9876543210", pin: "302001", quantity: "2", weight: "100", order: "AAN-1042", hsn_code: "6204" });
    expect(s.add).toBe("12 MG Road, Near park");
    expect(buildDelhiveryShipment({ ...order, paymentMethod: "online" }, "WH").shipments[0]!.cod_amount).toBe("0");
  });

  it("reads serviceability honestly (unknown when the response is unexpected)", () => {
    expect(parseDelhiveryServiceability({ delivery_codes: [] }, false).serviceable).toBe(false);
    expect(parseDelhiveryServiceability({ delivery_codes: [{ postal_code: { pre_paid: "Y", cod: "N" } }] }, true)).toMatchObject({ serviceable: false, codAvailable: false });
    expect(parseDelhiveryServiceability({ delivery_codes: [{ postal_code: { pre_paid: "Y", cod: "Y" } }] }, true).serviceable).toBe(true);
    expect(parseDelhiveryServiceability({ error: "x" }, false).serviceable).toBeNull();
  });

  it("extracts the waybill or a readable error", () => {
    expect(parseDelhiveryCreate({ packages: [{ waybill: "1234567890", status: "Success" }] })).toEqual({ waybill: "1234567890", error: null });
    expect(parseDelhiveryCreate({ packages: [{ status: "Fail", remarks: ["Pincode not serviceable"] }] }).error).toBe("Pincode not serviceable");
    expect(parseDelhiveryCreate({ rmk: "ClientWarehouse matching query does not exist." }).error).toMatch(/ClientWarehouse/);
  });
});
