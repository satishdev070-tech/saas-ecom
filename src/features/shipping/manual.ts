import type { ShippingProvider } from "./types";

/**
 * Manual provider: the seller books the courier themselves and enters carrier + tracking in
 * the dashboard (update_fulfillment). Serviceability comes from the store's own shipping rates
 * and PIN rules (checkout pricing engine), so this adapter has nothing extra to say.
 */
export const manualShippingProvider: ShippingProvider = {
  id: "manual",
  async serviceability() {
    return { serviceable: null, codAvailable: null, etaDays: null, courier: null };
  },
  async createShipment() {
    return { provider: "manual", providerRef: null, carrier: null, trackingNumber: null, trackingUrl: null, metadata: {} };
  },
};
