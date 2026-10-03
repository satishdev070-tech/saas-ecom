import { describe, expect, it } from "vitest";
import { buildCsv, csvResponse, escapeCsvCell } from "@/features/analytics/csv";
import { ORDER_CSV_HEADER, orderCsvRow } from "@/features/orders-admin/format";
import { CUSTOMER_CSV_HEADER, customerCsvRows, type CustomerExportRow } from "@/features/customers/export";

describe("escapeCsvCell", () => {
  it("neutralises formula injection for text starting with = + - @ tab CR", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(escapeCsvCell("+91 98765")).toBe("'+91 98765");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
    expect(escapeCsvCell("\rcmd")).toBe(`"'\rcmd"`);
  });

  it("leaves real numbers alone, including negatives", () => {
    expect(escapeCsvCell(-12.5)).toBe("-12.5");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  it("handles null, booleans and dates", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("buildCsv", () => {
  it("adds BOM, CRLF line endings and escapes every cell", () => {
    const csv = buildCsv(["Name", "Note"], [["Asha", "=cmd"], ["Ravi, K", null]]);
    expect(csv).toBe("﻿Name,Note\r\nAsha,'=cmd\r\n\"Ravi, K\",\r\n");
  });

  it("csvResponse sets attachment headers with a sanitised filename", async () => {
    const res = csvResponse('orders"; rm -rf.csv', "a\r\n");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="orders___rm_-rf.csv"');
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toBe("a\r\n");
  });
});

describe("orderCsvRow", () => {
  it("maps an order with rupee amounts and escapes hostile address text", () => {
    const row = orderCsvRow({
      order_number: 1042,
      placed_at: "2026-09-01T10:00:00Z",
      status: "confirmed",
      payment_status: "paid",
      fulfillment_status: "unfulfilled",
      payment_method: "online",
      email: "a@b.in",
      phone: "+919876543210",
      subtotal: 2499,
      discount_total: 249.9,
      shipping_total: 0,
      cod_fee: 0,
      tax_total: 119,
      grand_total: 2249.1,
      refunded_total: 0,
      discount_code: "SALE10",
      shipping_address: { name: "=evil()", city: "Jaipur", state: "Rajasthan", postal_code: "302001" },
    });
    expect(row).toHaveLength(ORDER_CSV_HEADER.length);
    expect(row[0]).toBe("#1042");
    expect(row[17]).toBe(2249.1);
    const csv = buildCsv(ORDER_CSV_HEADER, [row]);
    expect(csv).toContain("'=evil()");
    expect(csv).toContain("'+919876543210");
  });
});

describe("customerCsvRows (consent)", () => {
  const base: CustomerExportRow = {
    first_name: "Neha",
    last_name: "Sharma",
    email: "neha@example.in",
    phone: "+919000000001",
    accepts_marketing: true,
    marketing_consent_at: "2026-01-01T00:00:00Z",
    status: "active",
    tags: ["vip", "jaipur"],
    orders_count: 3,
    total_spent: 7497,
    last_order_at: null,
    created_at: "2025-12-01T00:00:00Z",
  };
  const noConsent = { ...base, email: "no@example.in", accepts_marketing: false, marketing_consent_at: null };
  const blocked = { ...base, email: "blocked@example.in", status: "blocked" };

  it("marketing export only contains opted-in, active customers", () => {
    const rows = customerCsvRows([base, noConsent, blocked], "marketing");
    expect(rows).toHaveLength(1);
    expect(rows[0]![2]).toBe("neha@example.in");
    expect(rows[0]).toHaveLength(CUSTOMER_CSV_HEADER.marketing.length);
  });

  it("full export includes everyone with explicit consent columns", () => {
    const rows = customerCsvRows([base, noConsent], "all");
    expect(rows).toHaveLength(2);
    expect(rows[1]![4]).toBe("no");
    expect(rows[0]![4]).toBe("yes");
    expect(rows[0]![7]).toBe("vip; jaipur");
    expect(rows[0]![9]).toBe(7497);
    expect(rows[0]).toHaveLength(CUSTOMER_CSV_HEADER.all.length);
  });
});
