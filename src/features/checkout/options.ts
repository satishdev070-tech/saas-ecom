import { z } from "zod";

/**
 * Per-store checkout options (stores.checkout_settings, migration 2500). PURE. Missing keys mean
 * today's behaviour: guest checkout allowed and "use my location" offered.
 */
export type CheckoutOptions = { guestCheckout: boolean; locationAutofill: boolean };

export const DEFAULT_CHECKOUT_OPTIONS: CheckoutOptions = { guestCheckout: true, locationAutofill: true };

export function parseCheckoutOptions(raw: unknown): CheckoutOptions {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    guestCheckout: typeof v.guest_checkout === "boolean" ? v.guest_checkout : DEFAULT_CHECKOUT_OPTIONS.guestCheckout,
    locationAutofill: typeof v.location_autofill === "boolean" ? v.location_autofill : DEFAULT_CHECKOUT_OPTIONS.locationAutofill,
  };
}

const checkbox = z.preprocess((v) => v === "true" || v === "on" || v === true, z.boolean());
export const checkoutOptionsSchema = z.object({ guestCheckout: checkbox, locationAutofill: checkbox });

export function toCheckoutSettingsJson(o: CheckoutOptions): { guest_checkout: boolean; location_autofill: boolean } {
  return { guest_checkout: o.guestCheckout, location_autofill: o.locationAutofill };
}
