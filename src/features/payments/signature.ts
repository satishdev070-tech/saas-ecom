import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Pure signature helpers (unit tested). Constant-time comparisons only. */

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex strings (false on any length/format mismatch). */
export function safeEqualHex(expectedHex: string, givenHex: string | null | undefined): boolean {
  if (!givenHex || !/^[0-9a-f]+$/i.test(givenHex) || givenHex.length !== expectedHex.length) return false;
  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(givenHex.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay Checkout success handler signature:
 * HMAC_SHA256(key_secret, razorpay_order_id + "|" + razorpay_payment_id), hex.
 */
export function verifyRazorpayPaymentSignature(input: { orderId: string; paymentId: string; signature: string | null | undefined; keySecret: string }): boolean {
  if (!input.orderId || !input.paymentId || !input.keySecret) return false;
  return safeEqualHex(hmacSha256Hex(input.keySecret, `${input.orderId}|${input.paymentId}`), input.signature);
}

/** Razorpay webhook: X-Razorpay-Signature = HMAC_SHA256(webhook_secret, raw request body), hex. */
export function verifyRazorpayWebhookSignature(rawBody: string | Buffer, signature: string | null | undefined, webhookSecret: string): boolean {
  if (!webhookSecret) return false;
  return safeEqualHex(hmacSha256Hex(webhookSecret, rawBody), signature);
}

/** Constant-time check of an `Authorization: Bearer <secret>` header (hash first so lengths match). */
export function bearerMatches(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = createHmac("sha256", "cron").update(header.slice(7)).digest();
  const expected = createHmac("sha256", "cron").update(secret).digest();
  return timingSafeEqual(given, expected);
}

// ---------------------------------------------------------------------------------------------
// Cashfree (cashfree.com/docs/payments/online/webhooks/signature-verification)

/** x-webhook-signature = Base64(HMAC_SHA256(secretKey, x-webhook-timestamp + rawBody)). */
export function cashfreeWebhookSignature(secretKey: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secretKey).update(timestamp + rawBody).digest("base64");
}

export function verifyCashfreeWebhookSignature(input: { rawBody: string; timestamp: string | null; signature: string | null; secretKey: string; nowMs?: number; toleranceSec?: number }): boolean {
  if (!input.secretKey || !input.timestamp || !input.signature) return false;
  // Reject stale deliveries (replay protection); Cashfree sends epoch milliseconds.
  const ts = Number(input.timestamp);
  if (Number.isFinite(ts)) {
    const ms = ts > 1e12 ? ts : ts * 1000;
    if (Math.abs((input.nowMs ?? Date.now()) - ms) > (input.toleranceSec ?? 600) * 1000) return false;
  }
  const expected = Buffer.from(cashfreeWebhookSignature(input.secretKey, input.timestamp, input.rawBody));
  const given = Buffer.from(input.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------------------------------------
// PayU (docs.payu.in/docs/generate-hash-payu-hosted, verify_payment API)

export type PayuHashFields = { key: string; txnid: string; amount: string; productinfo: string; firstname: string; email: string; udf1?: string; udf2?: string; udf3?: string; udf4?: string; udf5?: string };

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

/** Request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT). */
export function payuRequestHash(f: PayuHashFields, salt: string): string {
  return sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1 ?? "", f.udf2 ?? "", f.udf3 ?? "", f.udf4 ?? "", f.udf5 ?? "", "", "", "", "", "", salt].join("|"));
}

/** Response hash: [additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key. */
export function payuResponseHash(p: Record<string, string | undefined>, salt: string): string {
  const parts = [salt, p.status ?? "", "", "", "", "", "", p.udf5 ?? "", p.udf4 ?? "", p.udf3 ?? "", p.udf2 ?? "", p.udf1 ?? "", p.email ?? "", p.firstname ?? "", p.productinfo ?? "", p.amount ?? "", p.txnid ?? "", p.key ?? ""];
  return sha512((p.additional_charges ? `${p.additional_charges}|` : "") + parts.join("|"));
}

export function verifyPayuResponse(p: Record<string, string | undefined>, salt: string): boolean {
  if (!salt || !p.hash) return false;
  return safeEqualHex(payuResponseHash(p, salt), p.hash);
}

/** API command hash: sha512(key|command|var1|salt). */
export function payuCommandHash(key: string, command: string, var1: string, salt: string): string {
  return sha512(`${key}|${command}|${var1}|${salt}`);
}
