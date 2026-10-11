import { describe, expect, it } from "vitest";
import { methodLabel, parseTxnFilters, summarizeTransactions, txnCsvRow, txnSearch } from "@/features/payments/transactions-format";

describe("payment transactions helpers", () => {
  it("summarises collected amounts in paise, success rate and per-gateway totals", () => {
    const s = summarizeTransactions([
      { status: "captured", amount: 1499.5, provider: "razorpay" },
      { status: "partially_refunded", amount: 500, provider: "cashfree" },
      { status: "failed", amount: 999, provider: "cashfree" },
      { status: "created", amount: 200, provider: "razorpay" },
    ]);
    expect(s.collectedMinor).toBe(149950 + 50000);
    expect(s.successCount).toBe(2);
    expect(s.failedCount).toBe(1);
    expect(s.pendingCount).toBe(1);
    expect(s.successRate).toBeCloseTo(2 / 3);
    expect(s.byProvider[0]).toEqual({ provider: "razorpay", collectedMinor: 149950, count: 1 });
  });

  it("success rate is null when nothing finished", () => {
    expect(summarizeTransactions([{ status: "created", amount: 1, provider: "payu" }]).successRate).toBeNull();
  });

  it("parses filters and drops invalid values", () => {
    const f = parseTxnFilters({ provider: "stripe", status: "captured", from: "2026-10-01", to: "nope", page: "3", q: " pay_123 " });
    expect(f).toMatchObject({ provider: undefined, status: "captured", from: "2026-10-01", to: undefined, page: 3, q: "pay_123" });
  });

  it("search strips PostgREST syntax and detects order numbers", () => {
    expect(txnSearch("pay_AB12,status.eq.x)")).toEqual({ text: "pay_AB12statuseqx", orderNumber: null });
    expect(txnSearch("#1042")).toEqual({ text: "1042", orderNumber: 1042 });
    expect(txnSearch("(),")).toBeNull();
  });

  it("labels gateway methods", () => {
    expect(methodLabel("upi")).toBe("UPI");
    expect(methodLabel("CREDIT_CARD")).toBe("Credit card");
    expect(methodLabel(null)).toBe("—");
  });

  it("builds a CSV row with the order label", () => {
    const row = txnCsvRow(
      { id: "1", order_id: "o", provider: "cashfree", provider_order_id: "pl_x", provider_payment_id: "123", amount: 10, currency: "INR", status: "captured", method: "UPI", error_description: null, paid_at: null, created_at: "2026-10-11T00:00:00Z", orders: { order_number: 7, email: "a@b.in", phone: null } },
      (n) => `TP${n}`,
    );
    expect(row.slice(2, 7)).toEqual(["TP7", "Cashfree", "Successful", "UPI", 10]);
  });
});
