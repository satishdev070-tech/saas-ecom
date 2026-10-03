import "server-only";
import { cache } from "react";
import { logger } from "@/lib/observability/logger";
import { getEntitlements } from "@/features/platform";
import { onlinePaymentProvider, type OnlineProviderId } from "@/features/payments/credentials";

export type PaymentOptions = {
  /** store-level COD switch AND the `cod` feature (per-order eligibility is decided by the pricing engine) */
  codOffered: boolean;
  /** provider behind "Pay online", or null when online payment isn't available */
  online: OnlineProviderId | null;
};

/**
 * Payment methods a host-resolved tenant offers. Feature flags come from the platform's
 * entitlements (override > plan > default); a flag lookup failure falls back to the defaults
 * (COD on, online on) rather than blocking checkout.
 */
export const loadPaymentOptions = cache(async (tenantId: string, codEnabledInSettings: boolean): Promise<PaymentOptions> => {
  let codFlag = true;
  let onlineFlag = true;
  try {
    const ent = await getEntitlements(tenantId);
    codFlag = ent.isEnabled("cod");
    onlineFlag = ent.isEnabled("online_payments");
  } catch (err) {
    logger.warn("checkout.entitlements_unavailable", { tenantId, error: err });
  }
  const online = onlineFlag ? await onlinePaymentProvider(tenantId) : null;
  return { codOffered: codEnabledInSettings && codFlag, online };
});
