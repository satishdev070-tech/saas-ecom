import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Razorpay webhook parsing + decisions. PURE (unit tested); IO lives in webhook-handler.ts.
 * Only called AFTER the X-Razorpay-Signature has been verified with the tenant's secret.
 */

const notes = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional().nullable();

const paymentEntity = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  amount: z.number().int().nonnegative(),
  currency: z.string().default("INR"),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  order_id: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
  notes,
});

const refundEntity = z.object({
  id: z.string().regex(/^rfnd_[A-Za-z0-9]+$/),
  payment_id: z.string(),
  amount: z.number().int().nonnegative(),
  status: z.enum(["pending", "processed", "failed"]),
});

const eventSchema = z.object({
  event: z.string().max(80),
  account_id: z.string().optional(),
  created_at: z.number().optional(),
  payload: z.object({
    payment: z.object({ entity: paymentEntity }).optional(),
    refund: z.object({ entity: refundEntity }).optional(),
  }),
});

export type RazorpayPaymentEntity = z.infer<typeof paymentEntity>;
export type RazorpayRefundEntity = z.infer<typeof refundEntity>;
export type RazorpayEvent = z.infer<typeof eventSchema>;

export function parseRazorpayEvent(body: unknown): RazorpayEvent | null {
  const r = eventSchema.safeParse(body);
  return r.success ? r.data : null;
}

export type WebhookAction =
  | { kind: "mark_paid"; payment: RazorpayPaymentEntity }
  | { kind: "capture"; payment: RazorpayPaymentEntity }
  | { kind: "payment_failed"; payment: RazorpayPaymentEntity }
  | { kind: "refund"; refund: RazorpayRefundEntity }
  | { kind: "ignore"; reason: string };

/** What to do for a verified event. Unknown / irrelevant events are acknowledged and ignored. */
export function classifyRazorpayEvent(e: RazorpayEvent): WebhookAction {
  const payment = e.payload.payment?.entity;
  const refund = e.payload.refund?.entity;
  switch (e.event) {
    case "payment.captured":
    case "order.paid":
      if (!payment) return { kind: "ignore", reason: "no payment entity" };
      if (payment.status !== "captured") return { kind: "ignore", reason: `payment status ${payment.status}` };
      if (!payment.order_id) return { kind: "ignore", reason: "payment without order" };
      return { kind: "mark_paid", payment };
    case "payment.authorized":
      // Accounts with auto-capture off: capture it ourselves (amount re-checked against the order).
      if (!payment?.order_id || payment.status !== "authorized") return { kind: "ignore", reason: "not capturable" };
      return { kind: "capture", payment };
    case "payment.failed":
      if (!payment?.order_id) return { kind: "ignore", reason: "payment without order" };
      return { kind: "payment_failed", payment };
    case "refund.processed":
    case "refund.failed":
    case "refund.created":
      if (!refund) return { kind: "ignore", reason: "no refund entity" };
      return { kind: "refund", refund };
    default:
      return { kind: "ignore", reason: `unhandled event ${e.event}` };
  }
}

/**
 * Idempotency on `webhook_events (provider, event_id)`: an event already PROCESSED is a
 * duplicate delivery (acknowledge, do nothing). A row without processed_at means an earlier
 * attempt failed or is in flight; processing again is safe because every action is idempotent
 * (mark_order_paid returns early when already paid, refunds are matched by provider id).
 */
export function webhookIdempotency(existing: { processed_at: string | null } | null): "process" | "duplicate" {
  return existing?.processed_at ? "duplicate" : "process";
}

/** Razorpay sends X-Razorpay-Event-Id; fall back to a hash of the (verified) raw body. */
export function webhookEventId(headerId: string | null | undefined, rawBody: string): string {
  if (headerId && /^[A-Za-z0-9_-]{6,100}$/.test(headerId)) return headerId;
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

/** Our order id from payment notes (set when we created the Razorpay order). */
export function orderIdFromNotes(payment: RazorpayPaymentEntity): string | null {
  const n = payment.notes;
  if (!n || Array.isArray(n)) return null;
  const id = n.order_id;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export function tenantIdFromNotes(payment: RazorpayPaymentEntity): string | null {
  const n = payment.notes;
  if (!n || Array.isArray(n)) return null;
  return typeof n.tenant_id === "string" ? n.tenant_id : null;
}
