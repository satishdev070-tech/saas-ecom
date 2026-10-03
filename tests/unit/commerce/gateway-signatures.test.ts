import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cashfreeWebhookSignature, payuCommandHash, payuRequestHash, payuResponseHash, verifyCashfreeWebhookSignature, verifyPayuResponse } from "@/features/payments/signature";

describe("Cashfree webhook signature", () => {
  const secret = "cfsk_test_secret";
  const ts = "1790000000000";
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"pl_1"}}}';
  it("matches Base64(HMAC_SHA256(secret, timestamp + rawBody))", () => {
    expect(cashfreeWebhookSignature(secret, ts, body)).toBe(createHmac("sha256", secret).update(ts + body).digest("base64"));
  });
  it("verifies genuine deliveries and rejects tampering, wrong secrets and stale timestamps", () => {
    const sig = cashfreeWebhookSignature(secret, ts, body);
    const now = 1790000000000 + 60_000;
    expect(verifyCashfreeWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secretKey: secret, nowMs: now })).toBe(true);
    expect(verifyCashfreeWebhookSignature({ rawBody: body + " ", timestamp: ts, signature: sig, secretKey: secret, nowMs: now })).toBe(false);
    expect(verifyCashfreeWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secretKey: "other", nowMs: now })).toBe(false);
    expect(verifyCashfreeWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secretKey: secret, nowMs: now + 3_600_000 })).toBe(false);
    expect(verifyCashfreeWebhookSignature({ rawBody: body, timestamp: null, signature: sig, secretKey: secret })).toBe(false);
  });
});

describe("PayU hashes", () => {
  const salt = "SALT123";
  const f = { key: "KEY1", txnid: "pl100x1a2b", amount: "1499.00", productinfo: "Order #100", firstname: "Neha", email: "n@example.test", udf1: "order-uuid" };
  it("request hash follows key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT", () => {
    const expected = createHash("sha512").update("KEY1|pl100x1a2b|1499.00|Order #100|Neha|n@example.test|order-uuid||||||||||SALT123").digest("hex");
    expect(payuRequestHash(f, salt)).toBe(expected);
  });
  it("response hash follows SALT|status||||||udf5..udf1|email|firstname|productinfo|amount|txnid|key and verifies", () => {
    const resp = { ...f, status: "success" };
    const expected = createHash("sha512").update("SALT123|success||||||||||order-uuid|n@example.test|Neha|Order #100|1499.00|pl100x1a2b|KEY1").digest("hex");
    expect(payuResponseHash(resp, salt)).toBe(expected);
    expect(verifyPayuResponse({ ...resp, hash: expected }, salt)).toBe(true);
    expect(verifyPayuResponse({ ...resp, amount: "1.00", hash: expected }, salt)).toBe(false);
    expect(verifyPayuResponse({ ...resp, status: "failure", hash: expected }, salt)).toBe(false);
  });
  it("prefixes additional charges when present", () => {
    const resp = { ...f, status: "success", additional_charges: "10.00" };
    expect(payuResponseHash(resp, salt).length).toBe(128);
    expect(payuResponseHash(resp, salt)).not.toBe(payuResponseHash({ ...f, status: "success" }, salt));
  });
  it("command hash is sha512(key|command|var1|salt)", () => {
    expect(payuCommandHash("KEY1", "verify_payment", "tx1", salt)).toBe(createHash("sha512").update("KEY1|verify_payment|tx1|SALT123").digest("hex"));
  });
});
