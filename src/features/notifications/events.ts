import "server-only";
import { after } from "next/server";
import { logger } from "@/lib/observability/logger";

/**
 * Shared notification dispatcher (email, WhatsApp, ...).
 *
 * Code paths that change order / shipment / return / cart state call `emit(event)`. Every
 * registered channel receives every event and decides itself whether to act (store toggles,
 * missing recipient, unsupported event). Dispatch runs AFTER the response via `after()` so a
 * slow provider never blocks checkout; outside a request scope (scripts, tests) it runs
 * detached. Channels must never throw into the caller: failures are caught and logged here.
 *
 * Tenant ids in events must be server-resolved (verified host, membership, verified webhook).
 * Events carry ids only — channels load the data themselves with a tenant filter, so no PII
 * travels through the dispatcher or its logs.
 */

export type OrderPlacedEvent = { type: "order.placed"; tenantId: string; orderId: string; payment: "cod" | "paid" };

export type OrderStatusChangedEvent = {
  type: "order.status_changed";
  tenantId: string;
  orderId: string;
  status: "paid" | "payment_failed" | "cancelled" | "refunded";
  cancelReason?: string | null;
  /** refunded: amount of THIS refund in paise. */
  refundAmountMinor?: number;
  /** refunded: refund row / provider id, keeps two partial refunds distinct for idempotency. */
  refundId?: string | null;
};

export type ShipmentUpdatedEvent = {
  type: "shipment.updated";
  tenantId: string;
  orderId: string;
  shipmentId?: string | null;
  status: "shipped" | "out_for_delivery" | "delivered";
};

export type ReturnUpdatedEvent = {
  type: "return.updated";
  tenantId: string;
  orderId: string;
  returnId?: string | null;
  status: "requested" | "approved" | "rejected" | "received" | "refunded" | "closed";
};

export type CartAbandonedEvent = { type: "cart.abandoned"; tenantId: string; cartId: string };

export type NotificationEvent = (OrderPlacedEvent | OrderStatusChangedEvent | ShipmentUpdatedEvent | ReturnUpdatedEvent | CartAbandonedEvent) & {
  /**
   * Set only for a deliberate manual re-send (dashboard "Resend email"): makes the idempotency
   * key unique so providers don't dedupe it against the original send.
   */
  resendNonce?: string;
};

export type NotificationEventType = NotificationEvent["type"];

export type ChannelOutcome = { status: "sent" | "skipped" | "failed"; detail?: string };

export type NotificationChannel = {
  /** Unique name, e.g. "email" or "whatsapp". Registering the same name again replaces it. */
  name: string;
  /** Called for EVERY event; return "skipped" for events the channel doesn't handle. */
  handle(event: NotificationEvent, ctx: { idempotencyKey: string }): Promise<ChannelOutcome | void>;
};

const registry = new Map<string, NotificationChannel>();

/** Adds (or replaces, by name) a channel. Returns an unregister function (used by tests). */
export function registerChannel(channel: NotificationChannel): () => void {
  registry.set(channel.name, channel);
  return () => {
    if (registry.get(channel.name) === channel) registry.delete(channel.name);
  };
}

export function listChannels(): string[] {
  return [...registry.keys()];
}

/**
 * Built-in channels, loaded lazily on first dispatch (keeps provider code out of the import
 * graph of every action that emits). A channel module's default export or `channel` export
 * is registered. Role D: add `() => import("./whatsapp/channel")` here.
 */
const DEFAULT_CHANNEL_LOADERS: Array<() => Promise<{ channel: NotificationChannel }>> = [() => import("./email/channel"), () => import("./whatsapp/channel")];

let defaultsLoaded: Promise<void> | null = null;
function loadDefaultChannels(): Promise<void> {
  defaultsLoaded ??= Promise.all(
    DEFAULT_CHANNEL_LOADERS.map(async (load) => {
      try {
        const mod = await load();
        if (!registry.has(mod.channel.name)) registerChannel(mod.channel);
      } catch (err) {
        logger.error("notifications.channel_load_failed", { error: err });
      }
    }),
  ).then(() => undefined);
  return defaultsLoaded;
}

/** Test hook: skip the built-in channels so a test controls the registry completely. */
export function __disableDefaultChannelsForTests(): void {
  defaultsLoaded = Promise.resolve();
}

/** Stable per-event key; channels append their own name (`${key}:email`). */
export function eventIdempotencyKey(event: NotificationEvent): string {
  const base = (() => {
    switch (event.type) {
      case "order.placed":
        return `${event.tenantId}:order:${event.orderId}:placed`;
      case "order.status_changed":
        return `${event.tenantId}:order:${event.orderId}:${event.status}${event.status === "refunded" ? `:${event.refundId ?? event.refundAmountMinor ?? ""}` : ""}`;
      case "shipment.updated":
        return `${event.tenantId}:order:${event.orderId}:shipment:${event.status}`;
      case "return.updated":
        return `${event.tenantId}:order:${event.orderId}:return:${event.returnId ?? ""}:${event.status}`;
      case "cart.abandoned":
        return `${event.tenantId}:cart:${event.cartId}:abandoned`;
    }
  })();
  return event.resendNonce ? `${base}:resend:${event.resendNonce}` : base;
}

/** Runs every channel for one event and waits for all of them. Never throws. */
export async function dispatch(event: NotificationEvent): Promise<Record<string, ChannelOutcome>> {
  await loadDefaultChannels();
  const idempotencyKey = eventIdempotencyKey(event);
  const channels = [...registry.values()];
  const results = await Promise.allSettled(channels.map((c) => c.handle(event, { idempotencyKey: `${idempotencyKey}:${c.name}` })));
  const out: Record<string, ChannelOutcome> = {};
  results.forEach((r, i) => {
    const name = channels[i]!.name;
    if (r.status === "fulfilled") {
      out[name] = r.value ?? { status: "skipped" };
    } else {
      out[name] = { status: "failed", detail: "channel error" };
      logger.error("notifications.channel_failed", { channel: name, event: event.type, tenantId: event.tenantId, error: r.reason });
    }
  });
  return out;
}

/**
 * Fire-and-forget: schedules `dispatch` after the current response. Call it AFTER the state
 * change committed. Safe outside a request (falls back to a detached promise).
 */
export function emit(event: NotificationEvent): void {
  const run = () => dispatch(event).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}
