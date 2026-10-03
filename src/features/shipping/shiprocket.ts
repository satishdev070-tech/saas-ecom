import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { buildShiprocketOrder, parseServiceability } from "./shiprocket-format";
import type { ShipmentRef, ShippingProvider, Tracking } from "./types";

/**
 * Shiprocket REST adapter (apiv2.shiprocket.in/v1/external, fetch, no SDK). Each store connects its
 * own API user (Settings → API in Shiprocket); tokens last 10 days and are cached per API user.
 */
const API = "https://apiv2.shiprocket.in/v1/external";
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000;
const tokens = new Map<string, { value: string; expiresAt: number }>();

export type ShiprocketCredentials = { email: string; password: string };

async function login(creds: ShiprocketCredentials): Promise<{ status: number; token: string | null }> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { token?: string };
  return { status: res.status, token: res.ok && json.token ? json.token : null };
}

async function token(creds: ShiprocketCredentials, forceRefresh = false): Promise<string> {
  const cached = tokens.get(creds.email);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const r = await login(creds).catch((err: unknown) => {
    throw new AppError("INTERNAL", { message: "Shiprocket is unreachable.", context: { error: err instanceof Error ? err.message : String(err) } });
  });
  if (!r.token) throw new AppError("FORBIDDEN", { message: "Shiprocket rejected the API user credentials.", context: { status: r.status } });
  tokens.set(creds.email, { value: r.token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return r.token;
}

async function call<T>(creds: ShiprocketCredentials, method: "GET" | "POST", path: string, body?: unknown, retried = false): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(creds, retried)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new AppError("INTERNAL", { message: "Shiprocket is unreachable.", context: { path, error: err instanceof Error ? err.message : String(err) } });
  });
  if (res.status === 401 && !retried) return call<T>(creds, method, path, body, true);
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    logger.warn("shiprocket.api_error", { path, status: res.status, message: String(json.message ?? "").slice(0, 200) });
    throw new AppError(res.status === 422 || res.status === 400 ? "VALIDATION" : "INTERNAL", { message: `Shiprocket: ${String(json.message ?? "request rejected").slice(0, 160)}`, context: { path, status: res.status } });
  }
  return json;
}

const shipmentId = (ref: ShipmentRef) => {
  const id = Number(ref.providerRef);
  if (!Number.isFinite(id)) throw new AppError("VALIDATION", { message: "This shipment has no Shiprocket shipment id." });
  return id;
};

export function createShiprocketProvider(creds: ShiprocketCredentials): ShippingProvider {
  return {
    id: "shiprocket",
    async serviceability({ pickupPostcode, deliveryPostcode, weightGrams, cod }) {
      if (!pickupPostcode) return { serviceable: null, codAvailable: null, etaDays: null, courier: null };
      const qs = new URLSearchParams({ pickup_postcode: pickupPostcode, delivery_postcode: deliveryPostcode, weight: String(Math.max(0.1, Math.round(weightGrams / 10) / 100)), cod: cod ? "1" : "0" });
      return parseServiceability(await call<unknown>(creds, "GET", `/courier/serviceability/?${qs.toString()}`));
    },
    async createShipment(order, { pickupLocation }) {
      const res = await call<{ order_id?: number; shipment_id?: number; status?: string; awb_code?: string; courier_name?: string }>(creds, "POST", "/orders/create/adhoc", buildShiprocketOrder(order, pickupLocation));
      if (!res.shipment_id) throw new AppError("INTERNAL", { message: "Shiprocket didn't return a shipment.", context: { status: res.status } });
      // Assign the recommended courier + AWB straight away (best effort: can be retried from the order page).
      let awb = res.awb_code || null;
      let courier = res.courier_name || null;
      if (!awb) {
        try {
          const a = await call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(creds, "POST", "/courier/assign/awb", { shipment_id: res.shipment_id });
          awb = a.response?.data?.awb_code || null;
          courier = a.response?.data?.courier_name || courier;
        } catch (err) {
          logger.warn("shiprocket.assign_awb_failed", { shipmentId: res.shipment_id, error: err });
        }
      }
      return {
        provider: "shiprocket",
        providerRef: String(res.shipment_id),
        carrier: courier,
        trackingNumber: awb,
        trackingUrl: awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null,
        metadata: { shiprocket_order_id: res.order_id ?? null, shiprocket_shipment_id: res.shipment_id },
      };
    },
    async track(ref): Promise<Tracking> {
      if (!ref.trackingNumber) throw new AppError("VALIDATION", { message: "No AWB assigned yet." });
      const r = await call<{ tracking_data?: { shipment_status?: number; shipment_track?: { current_status?: string; delivered_date?: string }[]; shipment_track_activities?: { date?: string; activity?: string; location?: string }[] } }>(
        creds,
        "GET",
        `/courier/track/awb/${encodeURIComponent(ref.trackingNumber)}`,
      );
      const t = r.tracking_data;
      return {
        status: t?.shipment_track?.[0]?.current_status ?? "Unknown",
        deliveredAt: t?.shipment_track?.[0]?.delivered_date || null,
        events: (t?.shipment_track_activities ?? []).slice(0, 30).map((a) => ({ at: a.date ?? null, status: a.activity ?? "", location: a.location ?? null })),
      };
    },
    async label(ref) {
      const r = await call<{ label_url?: string; label_created?: number }>(creds, "POST", "/courier/generate/label", { shipment_id: [shipmentId(ref)] });
      return r.label_url ?? null;
    },
    async requestPickup(ref) {
      const r = await call<{ pickup_status?: number; response?: { pickup_scheduled_date?: string; data?: string } }>(creds, "POST", "/courier/generate/pickup", { shipment_id: [shipmentId(ref)] });
      return r.response?.pickup_scheduled_date ? `Pickup scheduled for ${r.response.pickup_scheduled_date}` : "Pickup requested";
    },
    async cancel(ref) {
      const orderId = Number(ref.metadata.shiprocket_order_id);
      if (!Number.isFinite(orderId)) throw new AppError("VALIDATION", { message: "This shipment has no Shiprocket order id." });
      await call(creds, "POST", "/orders/cancel", { ids: [orderId] });
    },
  };
}

/** Test Connection: a login with the API user. */
export async function testShiprocket(creds: ShiprocketCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await login(creds);
    if (r.token) {
      tokens.set(creds.email, { value: r.token, expiresAt: Date.now() + TOKEN_TTL_MS });
      return { ok: true, message: "Connected to Shiprocket." };
    }
    return { ok: false, message: r.status === 400 || r.status === 401 || r.status === 403 ? "Invalid credentials: check the API user email and password (not your panel login)." : `Shiprocket returned an unexpected response (${r.status}).` };
  } catch {
    return { ok: false, message: "Network error: Shiprocket could not be reached." };
  }
}
