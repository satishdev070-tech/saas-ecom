import { toDecimalString } from "@/lib/money";
import type { Serviceability, ShipmentOrder } from "./types";

/** Pure Shiprocket request/response mapping (unit tested). */

type Courier = { courier_name?: unknown; estimated_delivery_days?: unknown; etd_hours?: unknown; cod?: unknown; rate?: unknown };

export function parseServiceability(json: unknown): Serviceability {
  const data = (json && typeof json === "object" ? (json as { data?: { available_courier_companies?: unknown } }).data : undefined) ?? undefined;
  const list = Array.isArray(data?.available_courier_companies) ? (data.available_courier_companies as Courier[]) : null;
  if (list === null) return { serviceable: null, codAvailable: null, etaDays: null, courier: null };
  if (list.length === 0) return { serviceable: false, codAvailable: false, etaDays: null, courier: null };
  let best: { days: number; name: string | null } | null = null;
  let cod = false;
  for (const c of list) {
    if (c.cod === 1 || c.cod === true) cod = true;
    const days = Number(c.estimated_delivery_days);
    if (Number.isFinite(days) && days > 0 && (!best || days < best.days)) best = { days, name: typeof c.courier_name === "string" ? c.courier_name : null };
  }
  return { serviceable: true, codAvailable: cod, etaDays: best?.days ?? null, courier: best?.name ?? null };
}

/** Shiprocket expects "YYYY-MM-DD HH:mm" in IST. */
export function shiprocketDate(iso: string): string {
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const rupeesNumber = (minor: number) => Number(toDecimalString(minor));

/** Body for POST /v1/external/orders/create/adhoc. */
export function buildShiprocketOrder(order: ShipmentOrder, pickupLocation: string) {
  const [first = "", ...rest] = order.address.name.trim().split(/\s+/);
  const kg = Math.max(0.1, Math.round(order.weightGrams / 10) / 100);
  return {
    order_id: order.orderNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) || order.orderId,
    order_date: shiprocketDate(order.placedAt),
    pickup_location: pickupLocation,
    billing_customer_name: first,
    billing_last_name: rest.join(" "),
    billing_address: order.address.line1,
    billing_address_2: [order.address.line2, order.address.landmark].filter(Boolean).join(", "),
    billing_city: order.address.city,
    billing_pincode: order.address.postal_code,
    billing_state: order.address.state,
    billing_country: "India",
    billing_email: order.email ?? "",
    billing_phone: order.address.phone.replace(/^\+91/, ""),
    shipping_is_billing: true,
    order_items: order.items.map((i, idx) => ({
      name: i.title.slice(0, 100),
      sku: (i.sku || `ITEM-${idx + 1}`).slice(0, 50),
      units: i.quantity,
      selling_price: rupeesNumber(i.unitPrice),
      hsn: i.hsn ?? "",
    })),
    payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    shipping_charges: rupeesNumber(order.shippingTotal),
    total_discount: rupeesNumber(order.discountTotal),
    sub_total: rupeesNumber(order.subtotal),
    length: 30,
    breadth: 25,
    height: 5,
    weight: kg,
  };
}
