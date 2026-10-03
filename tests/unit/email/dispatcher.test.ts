import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { __disableDefaultChannelsForTests, dispatch, emit, eventIdempotencyKey, listChannels, registerChannel } = await import("@/features/notifications/events");
const { customerEmailFor } = await import("@/features/notifications/email/channel");

const T = "10000000-0000-4000-a000-00000000000a";
const O = "20000000-0000-4000-a000-000000000001";

describe("notification dispatcher", () => {
  beforeEach(() => {
    __disableDefaultChannelsForTests();
    for (const n of listChannels()) registerChannel({ name: n, handle: async () => undefined })();
  });

  it("routes every event to every channel with a per-channel idempotency key", async () => {
    const seen: string[] = [];
    const off1 = registerChannel({ name: "email", handle: async (e, c) => (seen.push(`email ${e.type} ${c.idempotencyKey}`), { status: "sent" }) });
    const off2 = registerChannel({ name: "whatsapp", handle: async (e, c) => (seen.push(`wa ${e.type} ${c.idempotencyKey}`), { status: "skipped" }) });
    const out = await dispatch({ type: "order.placed", tenantId: T, orderId: O, payment: "cod" });
    expect(out).toEqual({ email: { status: "sent" }, whatsapp: { status: "skipped" } });
    expect(seen).toEqual([`email order.placed ${T}:order:${O}:placed:email`, `wa order.placed ${T}:order:${O}:placed:whatsapp`]);
    off1();
    off2();
  });

  it("isolates a throwing channel", async () => {
    const off1 = registerChannel({ name: "boom", handle: async () => { throw new Error("x"); } });
    const off2 = registerChannel({ name: "ok", handle: async () => ({ status: "sent" }) });
    expect(await dispatch({ type: "cart.abandoned", tenantId: T, cartId: O })).toEqual({ boom: { status: "failed", detail: "channel error" }, ok: { status: "sent" } });
    off1();
    off2();
  });

  it("emit works outside a request scope (falls back to a detached dispatch)", async () => {
    const handle = vi.fn(async () => ({ status: "sent" as const }));
    const off = registerChannel({ name: "email", handle });
    expect(() => emit({ type: "shipment.updated", tenantId: T, orderId: O, status: "shipped" })).not.toThrow();
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());
    off();
  });

  it("idempotency keys: stable per state, distinct per refund and per manual re-send", () => {
    const a = eventIdempotencyKey({ type: "shipment.updated", tenantId: T, orderId: O, status: "shipped" });
    expect(eventIdempotencyKey({ type: "shipment.updated", tenantId: T, orderId: O, status: "shipped" })).toBe(a);
    expect(eventIdempotencyKey({ type: "shipment.updated", tenantId: T, orderId: O, status: "delivered" })).not.toBe(a);
    expect(eventIdempotencyKey({ type: "shipment.updated", tenantId: T, orderId: O, status: "shipped", resendNonce: "n1" })).toBe(`${a}:resend:n1`);
    const r1 = eventIdempotencyKey({ type: "order.status_changed", tenantId: T, orderId: O, status: "refunded", refundId: "r1" });
    const r2 = eventIdempotencyKey({ type: "order.status_changed", tenantId: T, orderId: O, status: "refunded", refundId: "r2" });
    expect(r1).not.toBe(r2);
  });

  it("maps events to customer emails", () => {
    expect(customerEmailFor({ type: "order.placed", tenantId: T, orderId: O, payment: "paid" })).toBe("order_placed");
    expect(customerEmailFor({ type: "order.status_changed", tenantId: T, orderId: O, status: "payment_failed" })).toBe("payment_failed");
    expect(customerEmailFor({ type: "order.status_changed", tenantId: T, orderId: O, status: "paid" })).toBeNull();
    expect(customerEmailFor({ type: "shipment.updated", tenantId: T, orderId: O, status: "out_for_delivery" })).toBe("out_for_delivery");
    expect(customerEmailFor({ type: "return.updated", tenantId: T, orderId: O, status: "closed" })).toBeNull();
    expect(customerEmailFor({ type: "return.updated", tenantId: T, orderId: O, status: "approved" })).toBe("return_update");
  });
});
