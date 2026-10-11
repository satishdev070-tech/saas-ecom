import "server-only";
import { cache } from "react";
import { logger } from "@/lib/observability/logger";
import { getEntitlements } from "@/features/platform";
import { onlinePaymentProviders, type OnlineProviderId } from "@/features/payments/credentials";

export type PaymentOptions = {
  /** store-level COD switch AND the `cod` feature (per-order eligibility is decided by the pricing engine) */
  codOffered: boolean;
  /** first provider behind "Pay online", or null when no online gateway is live */
  online: OnlineProviderId | null;
  /** every gateway the shopper can pick from on the pay page */
  gateways: OnlineProviderId[];
};

/**
 * Payment methods a host-resolved tenant offers.
 *
 * "Pay online" is offered when at least one gateway is live for the store: enabled by the seller,
 * connection-tested, and allowed by that gateway's OWN feature flag (razorpay → online_payments,
 * cashfree → payments_cashfree, payu → payments_payu; see integrations/registry). Each gateway is
 * gated individually in activeIntegration(), so there is no extra global gate here. Previously the
 * Razorpay flag gated all gateways, which hid Cashfree/PayU at checkout.
 */
export const loadPaymentOptions = cache(async (tenantId: string, codEnabledInSettings: boolean): Promise<PaymentOptions> => {
  let codFlag = true;
  try {
    const ent = await getEntitlements(tenantId);
    codFlag = ent.isEnabled("cod");
  } catch (err) {
    logger.warn("checkout.entitlements_unavailable", { tenantId, error: err });
  }
  let gateways: OnlineProviderId[] = [];
  try {
    gateways = await onlinePaymentProviders(tenantId);
  } catch (err) {
    logger.error("checkout.gateways_unavailable", { tenantId, error: err });
  }
  return { codOffered: codEnabledInSettings && codFlag, online: gateways[0] ?? null, gateways };
});
