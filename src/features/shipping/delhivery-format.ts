import { toDecimalString } from "@/lib/money";
import type { Serviceability, ShipmentOrder } from "./types";

/** Pure Delhivery Express request/response mapping (unit tested). */

export function parseDelhiveryServiceability(json: unknown, cod: boolean): Serviceability {
  const codes = (json as { delivery_codes?: { postal_code?: { pre_paid?: string; cod?: string; district?: string } }[] })?.delivery_codes;
  if (!Array.isArray(codes)) return { serviceable: null, codAvailable: null, etaDays: null, courier: null };
  const pc = codes[0]?.postal_code;
  if (!pc) return { serviceable: false, codAvailable: false, etaDays: null, courier: "Delhivery" };
  const prepaid = pc.pre_paid === "Y";
  const codOk = pc.cod === "Y";
  return { serviceable: cod ? codOk : prepaid || codOk, codAvailable: codOk, etaDays: null, courier: "Delhivery" };
}

/** Body for POST /api/cmu/create.json, sent form-encoded as format=json&data=<this JSON>. */
export function buildDelhiveryShipment(order: ShipmentOrder, pickupLocation: string) {
  const a = order.address;
  return {
    pickup_location: { name: pickupLocation },
    shipments: [
      {
        name: a.name.slice(0, 100),
        add: [a.line1, a.line2, a.landmark].filter(Boolean).join(", ").slice(0, 250),
        pin: a.postal_code,
        city: a.city,
        state: a.state,
        country: "India",
        phone: a.phone.replace(/^\+91/, "").replace(/\D/g, "").slice(-10),
        order: order.orderNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) || order.orderId,
        payment_mode: order.paymentMethod === "cod" ? "COD" : "Prepaid",
        cod_amount: order.paymentMethod === "cod" ? toDecimalString(order.grandTotal) : "0",
        total_amount: toDecimalString(order.grandTotal),
        products_desc: order.items.map((i) => `${i.title} x${i.quantity}`).join(", ").slice(0, 250),
        hsn_code: order.items.find((i) => i.hsn)?.hsn ?? "",
        quantity: String(order.items.reduce((s, i) => s + i.quantity, 0)),
        weight: String(Math.max(100, Math.round(order.weightGrams))),
        shipping_mode: "Surface",
        order_date: order.placedAt,
      },
    ],
  };
}

export function parseDelhiveryCreate(json: unknown): { waybill: string | null; error: string | null } {
  const j = json as { success?: boolean; rmk?: string; packages?: { waybill?: string; status?: string; remarks?: unknown }[] };
  const pkg = j?.packages?.[0];
  if (pkg?.waybill && pkg.status !== "Fail") return { waybill: pkg.waybill, error: null };
  const remarks = Array.isArray(pkg?.remarks) ? pkg.remarks.join("; ") : typeof pkg?.remarks === "string" ? pkg.remarks : j?.rmk;
  return { waybill: null, error: String(remarks || "Delhivery did not accept the shipment").slice(0, 200) };
}
