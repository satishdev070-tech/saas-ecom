import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { buildDelhiveryShipment, parseDelhiveryCreate, parseDelhiveryServiceability } from "./delhivery-format";
import type { ShipmentRef, ShippingProvider, Tracking } from "./types";

/**
 * Delhivery Express (last-mile) adapter, per delhivery-express-api-doc.readme.io:
 *   GET  /c/api/pin-codes/json/?filter_codes=PIN     serviceability
 *   POST /api/cmu/create.json  (format=json&data=…)   manifest a shipment → waybill
 *   GET  /api/v1/packages/json/?waybill=…             tracking
 *   GET  /api/p/packing_slip?wbns=…&pdf=true          label
 *   POST /api/p/edit {waybill, cancellation:"true"}   cancel
 * Auth: "Authorization: Token <api token>". Staging and production hosts differ.
 */
export type DelhiveryCredentials = { apiToken: string; environment: "test" | "live" };
const base = (env: "test" | "live") => (env === "live" ? "https://track.delhivery.com" : "https://staging-express.delhivery.com");

async function call<T>(creds: DelhiveryCredentials, method: "GET" | "POST", path: string, body?: { json?: unknown; form?: URLSearchParams }): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base(creds.environment)}${path}`, {
    method,
    headers: {
      Authorization: `Token ${creds.apiToken}`,
      Accept: "application/json",
      ...(body?.json ? { "Content-Type": "application/json" } : body?.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.json ? JSON.stringify(body.json) : body?.form,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch((err: unknown) => {
    throw new AppError("INTERNAL", { message: "Delhivery is unreachable.", context: { path, error: err instanceof Error ? err.message : String(err) } });
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (res.status === 401 || res.status === 403) throw new AppError("FORBIDDEN", { message: "Delhivery rejected the API token.", context: { path, status: res.status } });
  if (!res.ok) {
    logger.warn("delhivery.api_error", { path, status: res.status });
    throw new AppError("INTERNAL", { message: "Delhivery rejected the request.", context: { path, status: res.status } });
  }
  return { status: res.status, json };
}

const waybillOf = (ref: ShipmentRef) => {
  if (!ref.trackingNumber) throw new AppError("VALIDATION", { message: "This shipment has no Delhivery waybill." });
  return ref.trackingNumber;
};

export function createDelhiveryProvider(creds: DelhiveryCredentials): ShippingProvider {
  return {
    id: "delhivery",
    async serviceability({ deliveryPostcode, cod }) {
      const { json } = await call<unknown>(creds, "GET", `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(deliveryPostcode)}`);
      return parseDelhiveryServiceability(json, cod);
    },
    async createShipment(order, { pickupLocation }) {
      const form = new URLSearchParams({ format: "json", data: JSON.stringify(buildDelhiveryShipment(order, pickupLocation)) });
      const { json } = await call<unknown>(creds, "POST", "/api/cmu/create.json", { form });
      const r = parseDelhiveryCreate(json);
      if (!r.waybill) throw new AppError("VALIDATION", { message: `Delhivery: ${r.error}` });
      return {
        provider: "delhivery",
        providerRef: r.waybill,
        carrier: "Delhivery",
        trackingNumber: r.waybill,
        trackingUrl: `https://www.delhivery.com/track/package/${encodeURIComponent(r.waybill)}`,
        metadata: { delhivery_waybill: r.waybill },
      };
    },
    async track(ref): Promise<Tracking> {
      const { json } = await call<{ ShipmentData?: { Shipment?: { Status?: { Status?: string; StatusDateTime?: string }; Scans?: { ScanDetail?: { ScanDateTime?: string; Scan?: string; Instructions?: string; ScannedLocation?: string } }[] } }[] }>(
        creds,
        "GET",
        `/api/v1/packages/json/?waybill=${encodeURIComponent(waybillOf(ref))}`,
      );
      const s = json.ShipmentData?.[0]?.Shipment;
      const status = s?.Status?.Status ?? "Unknown";
      return {
        status,
        deliveredAt: /delivered/i.test(status) ? (s?.Status?.StatusDateTime ?? null) : null,
        events: (s?.Scans ?? []).slice(-30).reverse().map((x) => ({ at: x.ScanDetail?.ScanDateTime ?? null, status: x.ScanDetail?.Instructions || x.ScanDetail?.Scan || "", location: x.ScanDetail?.ScannedLocation ?? null })),
      };
    },
    async label(ref) {
      const { json } = await call<{ packages?: { pdf_download_link?: string }[] }>(creds, "GET", `/api/p/packing_slip?wbns=${encodeURIComponent(waybillOf(ref))}&pdf=true`);
      return json.packages?.[0]?.pdf_download_link ?? null;
    },
    async cancel(ref) {
      const { json } = await call<{ status?: boolean; remark?: string }>(creds, "POST", "/api/p/edit", { json: { waybill: waybillOf(ref), cancellation: "true" } });
      if (!json.status) throw new AppError("CONFLICT", { message: `Delhivery: ${String(json.remark ?? "cancellation was refused").slice(0, 160)}` });
    },
  };
}

/** Test Connection: a serviceability lookup for a metro PIN succeeds only with a valid token. */
export async function testDelhivery(creds: DelhiveryCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const { json } = await call<{ delivery_codes?: unknown[] }>(creds, "GET", "/c/api/pin-codes/json/?filter_codes=110001");
    if (Array.isArray(json.delivery_codes)) return { ok: true, message: `Connected to Delhivery ${creds.environment === "live" ? "production" : "staging"}.` };
    return { ok: false, message: "Delhivery returned an unexpected response." };
  } catch (err) {
    if (err instanceof AppError && err.code === "FORBIDDEN") return { ok: false, message: "Invalid credentials: check the API token and environment." };
    return { ok: false, message: "Network error: Delhivery could not be reached." };
  }
}
