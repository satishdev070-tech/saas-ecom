/**
 * Shipping provider abstraction (ADR-020). "manual" = the seller ships with any courier and enters
 * tracking by hand; "shiprocket" / "delhivery" = adapters built from the store's own encrypted
 * credentials (tenant_integrations) when that integration is connected, enabled and allowed by plan.
 * New couriers implement this interface; checkout and the dashboard never change.
 */
export type ShippingProviderId = "manual" | "shiprocket" | "delhivery";

export type TrackingEvent = { at: string | null; status: string; location: string | null };
export type Tracking = { status: string; deliveredAt: string | null; events: TrackingEvent[] };
export type ShipmentRef = { providerRef: string | null; trackingNumber: string | null; metadata: Record<string, unknown> };

export type Serviceability = {
  /** null = provider couldn't tell (fall back to the store's own PIN rules) */
  serviceable: boolean | null;
  codAvailable: boolean | null;
  /** fastest courier estimate in days, when known */
  etaDays: number | null;
  courier: string | null;
};

export type ShipmentOrder = {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  paymentMethod: "cod" | "online";
  /** paise */
  grandTotal: number;
  /** paise */
  subtotal: number;
  /** paise */
  discountTotal: number;
  /** paise */
  shippingTotal: number;
  email: string | null;
  phone: string;
  address: { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string };
  items: { title: string; sku: string | null; quantity: number; unitPrice: number; hsn: string | null }[];
  weightGrams: number;
};

export type CreatedShipment = {
  provider: ShippingProviderId;
  providerRef: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  metadata: Record<string, string | number | null>;
};

export interface ShippingProvider {
  readonly id: ShippingProviderId;
  serviceability(input: { pickupPostcode: string | null; deliveryPostcode: string; weightGrams: number; cod: boolean }): Promise<Serviceability>;
  createShipment(order: ShipmentOrder, options: { pickupLocation: string }): Promise<CreatedShipment>;
  track?(ref: ShipmentRef): Promise<Tracking>;
  label?(ref: ShipmentRef): Promise<string | null>;
  requestPickup?(ref: ShipmentRef): Promise<string>;
  cancel?(ref: ShipmentRef): Promise<void>;
}
