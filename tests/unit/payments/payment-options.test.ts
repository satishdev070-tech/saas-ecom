import { beforeEach, describe, expect, it, vi } from "vitest";

const flags: Record<string, boolean> = {};
let providers: string[] = [];

vi.mock("@/features/platform", () => ({
  getEntitlements: vi.fn(async () => ({ isEnabled: (k: string) => flags[k] ?? true })),
}));
vi.mock("@/features/payments/credentials", () => ({
  onlinePaymentProviders: vi.fn(async () => providers),
}));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { loadPaymentOptions } = await import("@/features/checkout/payment-options");

describe("loadPaymentOptions", () => {
  beforeEach(() => {
    for (const k of Object.keys(flags)) delete flags[k];
    providers = [];
  });

  it("offers Cashfree even when the Razorpay flag (online_payments) is off", async () => {
    flags.online_payments = false;
    providers = ["cashfree"];
    const o = await loadPaymentOptions("t-cf-only", true);
    expect(o.online).toBe("cashfree");
    expect(o.gateways).toEqual(["cashfree"]);
  });

  it("lists every live gateway, first one is the default", async () => {
    providers = ["razorpay", "cashfree"];
    const o = await loadPaymentOptions("t-both", true);
    expect(o.online).toBe("razorpay");
    expect(o.gateways).toEqual(["razorpay", "cashfree"]);
  });

  it("no live gateway → online not offered; COD follows store switch and flag", async () => {
    flags.cod = false;
    const o = await loadPaymentOptions("t-none", true);
    expect(o.online).toBeNull();
    expect(o.codOffered).toBe(false);
  });
});
