/**
 * Send gating and retry policy (pure; unit tested).
 */
import type { NotificationEvent } from "../events";
import type { WhatsAppEvent } from "./templates";

/** Dispatcher event -> WhatsApp notification event (null = not handled by WhatsApp). */
export function whatsappEventFor(event: NotificationEvent): WhatsAppEvent | null {
  switch (event.type) {
    case "order.placed":
      return "order_placed";
    case "shipment.updated":
      return event.status === "shipped" ? "order_shipped" : event.status === "out_for_delivery" ? "out_for_delivery" : "order_delivered";
    case "cart.abandoned":
      return "abandoned_cart";
    default:
      return null;
  }
}

export type GateInput = {
  connected: boolean;
  setting: { enabled: boolean; templateName: string | null; languageCode: string | null } | null;
  /** Normalised E.164 phone, or null when missing / invalid. */
  phone: string | null;
  optedIn: boolean;
};

export type GateResult = { send: true; templateName: string; languageCode: string; to: string } | { send: false; reason: string };

/** Every condition must hold before a business-initiated template message is queued. */
export function gate(input: GateInput): GateResult {
  if (!input.connected) return { send: false, reason: "whatsapp not connected" };
  if (!input.setting?.enabled) return { send: false, reason: "event disabled" };
  if (!input.setting.templateName || !input.setting.languageCode) return { send: false, reason: "no template mapped" };
  if (!input.phone) return { send: false, reason: "no valid phone" };
  if (!input.optedIn) return { send: false, reason: "customer not opted in" };
  return { send: true, templateName: input.setting.templateName, languageCode: input.setting.languageCode, to: input.phone };
}

/** Delay before attempt n+1 after attempt n failed (n starts at 1). */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
export function backoffMs(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1]!;
}

/**
 * Transient failures worth retrying: network errors, 5xx, throttling and Meta's documented
 * temporary codes. Everything else (bad template, unknown recipient, revoked token, policy
 * blocks) fails immediately: retrying would not help.
 */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);
export function isRetryable(httpStatus: number, code: number | null): boolean {
  if (httpStatus === 0 || httpStatus >= 500 || httpStatus === 429) return true;
  return code !== null && RETRYABLE_CODES.has(code);
}

export type AttemptOutcome = { ok: true; messageId: string } | { ok: false; httpStatus: number; code: number | null; message: string };

export type NextJobState =
  | { status: "sent"; providerMessageId: string }
  | { status: "queued"; nextAttemptAt: Date; lastError: string }
  | { status: "failed"; lastError: string };

/** What happens to a job after an attempt (attempts already counts this attempt). */
export function nextState(outcome: AttemptOutcome, attempts: number, maxAttempts: number, now: Date = new Date()): NextJobState {
  if (outcome.ok) return { status: "sent", providerMessageId: outcome.messageId };
  if (attempts < maxAttempts && isRetryable(outcome.httpStatus, outcome.code)) return { status: "queued", nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)), lastError: outcome.message };
  return { status: "failed", lastError: outcome.message };
}

/** Delivery status ordering: a late "delivered" must not overwrite "read". */
const RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
export function shouldApplyStatus(current: string, incoming: "sent" | "delivered" | "read" | "failed"): boolean {
  if (current === "failed" || current === "cancelled") return false;
  if (incoming === "failed") return current !== "read" && current !== "delivered";
  return (RANK[incoming] ?? 0) > (RANK[current] ?? 0);
}
