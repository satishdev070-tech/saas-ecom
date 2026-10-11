import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/storage/assets", () => ({ assetUrl: () => null }));
const { ShippingLabelDoc } = await import("@/features/orders-admin/print/documents");

const store = { name: "Ramya By Ayushi", legal_name: null, order_prefix: "RBA-", logo_path: null, address: { line1: "12 MG Road", city: "Noida", state: "Uttar Pradesh", postal_code: "201301" }, phone: "+919876543210" } as never;
const order = (o: Record<string, unknown>) => ({ id: "o1", order_number: 3, placed_at: "2026-10-11T10:49:00Z", grand_total: "699.00", shipping_address: { name: "Satish Yadav", line1: "Flat 402", city: "Noida", state: "Uttar Pradesh", postal_code: "201301", phone: "+918115220022" }, ...o });

describe("shipping label", () => {
  it("shows the COD amount in rupees (orders store rupees, not paise) and the order barcode", () => {
    const html = renderToStaticMarkup(h(ShippingLabelDoc, { store, p: { order: order({ payment_method: "cod", payment_status: "pending" }), items: [{ id: "i", quantity: 1 }], shipment: null, invoice: null } as never }));
    expect(html).toContain("COD ₹699");
    expect(html).toContain('aria-label="Barcode RBA-3"');
    expect(html).toContain("Satish Yadav");
  });
  it("prints PREPAID and the courier AWB when booked", () => {
    const html = renderToStaticMarkup(h(ShippingLabelDoc, { store, p: { order: order({ payment_method: "online", payment_status: "paid" }), items: [], shipment: { tracking_number: "1234567890", carrier: "Delhivery", weight_grams: 450 }, invoice: null } as never }));
    expect(html).toContain("PREPAID");
    expect(html).toContain("AWB 1234567890");
    expect(html).toContain("0.45 kg");
  });
});
