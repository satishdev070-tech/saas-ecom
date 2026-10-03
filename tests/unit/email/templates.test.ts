import { describe, expect, it } from "vitest";
import { renderAbandonedCartEmail, renderContactForwardEmail, renderCustomerOrderEmail, renderOwnerNewOrderEmail, renderTeamInviteEmail, type OrderEmailData } from "@/features/notifications/email/templates";
import { contrastText, safeColor } from "@/features/notifications/email/layout";

const evil = `<script>alert(1)</script>"'&`;

const base: OrderEmailData = {
  brand: { storeName: `Ramya <b>By</b> Ayushi`, logoUrl: "https://cdn.example.com/logo.png", accent: "#8a1c2b", storeUrl: "https://ramya.example.com", supportEmail: "hello@ramya.example.com" },
  customerName: evil,
  orderNumber: "#1042",
  orderUrl: "https://ramya.example.com/orders/abc?t=x",
  paymentUrl: "https://ramya.example.com/checkout/pay?t=x",
  paymentMethod: "cod",
  items: [{ title: `Silk saree ${evil}`, variant: "Red", quantity: 2, totalMinor: 249900 }],
  subtotalMinor: 249900,
  shippingMinor: 0,
  discountMinor: 10000,
  codFeeMinor: 5000,
  totalMinor: 244900,
  shippingAddress: ["Asha", "12 MG Road", "Jaipur Rajasthan 302001"],
  carrier: "Delhivery",
  trackingNumber: "AWB123",
  trackingUrl: "https://track.example.com/AWB123",
};

describe("customer order emails", () => {
  it("escapes shopper and store values in HTML and keeps the text part plain", () => {
    const e = renderCustomerOrderEmail("order_placed", base);
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).not.toContain("<b>By</b>");
    expect(e.text).toContain("Silk saree");
    expect(e.text).not.toContain("&lt;");
  });

  it("formats money as ₹ (en-IN) from paise, with COD wording", () => {
    const e = renderCustomerOrderEmail("order_placed", base);
    expect(e.html).toContain("₹2,499");
    expect(e.html).toContain("₹2,449");
    expect(e.html).toContain("COD fee");
    expect(e.html).toContain("To pay on delivery");
    expect(e.text).toMatch(/keep ₹2,449 ready/);
  });

  it("puts tracking details and a track button on shipped / out-for-delivery", () => {
    for (const kind of ["order_shipped", "out_for_delivery"] as const) {
      const e = renderCustomerOrderEmail(kind, base);
      expect(e.html).toContain("AWB123");
      expect(e.html).toContain('href="https://track.example.com/AWB123"');
      expect(e.text).toContain("Track your package: https://track.example.com/AWB123");
    }
  });

  it("drops unsafe links (javascript:, plain http) and invalid colours", () => {
    const e = renderCustomerOrderEmail("order_shipped", { ...base, trackingUrl: "javascript:alert(1)", orderUrl: "http://evil.example.com", brand: { ...base.brand, accent: "red;background:url(x)", logoUrl: "javascript:x" } });
    expect(e.html).not.toContain("javascript:");
    expect(e.html).not.toContain("http://evil.example.com");
    expect(e.html).not.toContain("url(x)");
    expect(safeColor("red")).toBe("#111111");
    expect(contrastText("#ffffff")).toBe("#111111");
  });

  it("treats seller templates as plain text and keeps subjects single-line", () => {
    const e = renderCustomerOrderEmail("order_placed", base, { subject: "Hi {{customer_name}}\r\nBcc: x@y.z", body: "<img src=x onerror=alert(1)> Thanks {{customer_name}}" });
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img src=x");
  });

  it("payment-failed links to the retry page; refund shows the amount", () => {
    expect(renderCustomerOrderEmail("payment_failed", base).html).toContain('href="https://ramya.example.com/checkout/pay?t=x"');
    expect(renderCustomerOrderEmail("refund_processed", { ...base, refundAmountMinor: 50050 }).html).toContain("₹500.50");
  });

  it("never contains secrets or env values", () => {
    const all = [
      renderCustomerOrderEmail("order_placed", base),
      renderOwnerNewOrderEmail({ ...base, dashboardUrl: "https://app.example.com/dashboard/orders/1", customerEmail: "a@b.in", customerPhone: "+919800000000" }),
      renderTeamInviteEmail({ brand: base.brand, inviterName: "Ayushi", roleName: "Staff", acceptUrl: "https://app.example.com/invite/tok", expiresInDays: 7 }),
      renderContactForwardEmail({ brand: base.brand, name: evil, email: "v@x.in", message: `hello ${evil}` }),
      renderAbandonedCartEmail({ brand: base.brand, customerName: "Asha", items: base.items, subtotalMinor: 249900, cartUrl: "https://ramya.example.com/cart" }),
    ];
    for (const e of all) {
      const blob = `${e.subject}${e.html}${e.text}`;
      expect(blob).not.toMatch(/re_[A-Za-z0-9]{8,}|RESEND_API_KEY|SUPABASE|APP_SECRET/);
      expect(e.html).toContain("<!doctype html>");
      expect(e.html).toContain('name="viewport"');
      expect(e.html).not.toContain("<script>");
    }
  });

  it("owner alert includes customer contact and dashboard link", () => {
    const e = renderOwnerNewOrderEmail({ ...base, dashboardUrl: "https://app.example.com/dashboard/orders/1", customerEmail: "a@b.in", customerPhone: "+919800000000" });
    expect(e.subject).toBe("New order #1042 — ₹2,449 (COD)");
    expect(e.html).toContain("+919800000000");
    expect(e.html).toContain('href="https://app.example.com/dashboard/orders/1"');
  });
});
