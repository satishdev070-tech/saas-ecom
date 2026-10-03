import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { toMinor } from "@/lib/money";
import { logger } from "@/lib/observability/logger";
import { assertPermission, type TenantContext } from "@/lib/tenant/membership";
import { activeIntegration } from "@/features/integrations/server/store";
import { readOrderAddress } from "@/features/customer-account/address";
import { manualShippingProvider } from "./manual";
import { createShiprocketProvider } from "./shiprocket";
import { createDelhiveryProvider } from "./delhivery";
import type { CreatedShipment, Serviceability, ShippingProvider, Tracking } from "./types";

export type ShippingSetup = { provider: ShippingProvider; pickupLocation: string; pickupPostcode: string | null };

/** Builds the adapter for a connected courier integration, or null when it isn't usable. */
async function courierFor(tenantId: string, id: "shiprocket" | "delhivery", storePostcode: string | null): Promise<ShippingSetup | null> {
  const it = await activeIntegration(tenantId, id);
  if (!it) return null;
  const pickupPostcode = /^[1-9]\d{5}$/.test(it.public.pickup_postcode ?? "") ? it.public.pickup_postcode! : storePostcode;
  const pickupLocation = (it.public.pickup_location || "Primary").slice(0, 60);
  if (id === "shiprocket" && it.public.email && it.secrets.password) return { provider: createShiprocketProvider({ email: it.public.email, password: it.secrets.password }), pickupLocation, pickupPostcode };
  if (id === "delhivery" && it.secrets.api_token) return { provider: createDelhiveryProvider({ apiToken: it.secrets.api_token, environment: it.environment }), pickupLocation, pickupPostcode };
  return null;
}

/**
 * Which courier a tenant ships with: the store's chosen default (stores.integrations.default_courier)
 * if connected, else the first connected one, else manual fulfilment. `tenantId` must be server-resolved.
 */
export const getShippingSetup = cache(async (tenantId: string, preferred?: "shiprocket" | "delhivery"): Promise<ShippingSetup> => {
  const admin = createSupabaseAdminClient();
  const { data: store } = await admin.from("stores").select("address, integrations").eq("tenant_id", tenantId).maybeSingle();
  const address = (store?.address ?? {}) as Record<string, unknown>;
  const storePostcode = typeof address.postal_code === "string" && /^[1-9]\d{5}$/.test(address.postal_code) ? address.postal_code : null;
  const def = (store?.integrations as { default_courier?: unknown } | null)?.default_courier;
  const order: ("shiprocket" | "delhivery")[] = preferred ? [preferred] : def === "delhivery" ? ["delhivery", "shiprocket"] : ["shiprocket", "delhivery"];
  for (const id of order) {
    try {
      const setup = await courierFor(tenantId, id, storePostcode);
      if (setup) return setup;
    } catch (err) {
      logger.warn("shipping.courier_unavailable", { tenantId, courier: id, error: err });
    }
  }
  return { provider: manualShippingProvider, pickupLocation: "Primary", pickupPostcode: storePostcode };
});

/** Courier serviceability for a PIN (informational; never throws, null = unknown). */
export async function checkServiceability(tenantId: string, pincode: string, weightGrams: number, cod: boolean): Promise<Serviceability> {
  try {
    const setup = await getShippingSetup(tenantId);
    return await setup.provider.serviceability({ pickupPostcode: setup.pickupPostcode, deliveryPostcode: pincode, weightGrams: Math.max(100, weightGrams), cod });
  } catch (err) {
    logger.warn("shipping.serviceability_failed", { tenantId, error: err });
    return { serviceable: null, codAvailable: null, etaDays: null, courier: null };
  }
}

/**
 * Books a shipment with the tenant's provider for a confirmed, unshipped order (seller
 * dashboard; permission orders.write). Reads and writes through the user-scoped client, so RLS
 * applies too. Returns the created shipment; tracking can then be set via update_fulfillment.
 */
export async function createShipmentForOrder(ctx: TenantContext, orderId: string): Promise<CreatedShipment & { shipmentId: string }> {
  assertPermission(ctx, "orders.write");
  const supabase = await createSupabaseServerClient();
  const { data: o, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, placed_at, status, fulfillment_status, payment_method, grand_total, subtotal, discount_total, shipping_total, email, phone, shipping_address, order_items(product_title, sku, quantity, unit_price, hsn_code, variant_id)",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  if (!o) throw new AppError("NOT_FOUND");
  if (o.status !== "confirmed" || o.fulfillment_status !== "unfulfilled") {
    throw new AppError("CONFLICT", { message: "Only confirmed orders that haven't shipped can be booked with a courier." });
  }
  const { data: existing } = await supabase.from("shipments").select("id").eq("tenant_id", ctx.tenantId).eq("order_id", orderId).neq("status", "cancelled").limit(1).maybeSingle();
  if (existing) throw new AppError("CONFLICT", { message: "A shipment already exists for this order." });
  const address = readOrderAddress(o.shipping_address);
  if (!address) throw new AppError("VALIDATION", { message: "The order has no shipping address." });

  const variantIds = (o.order_items ?? []).map((i) => i.variant_id).filter((v): v is string => Boolean(v));
  const { data: variants } = variantIds.length
    ? await supabase.from("product_variants").select("id, weight_grams").eq("tenant_id", ctx.tenantId).in("id", variantIds)
    : { data: [] as { id: string; weight_grams: number }[] };
  const weightById = new Map((variants ?? []).map((v) => [v.id, v.weight_grams]));
  const weightGrams = (o.order_items ?? []).reduce((sum, i) => sum + (i.variant_id ? (weightById.get(i.variant_id) ?? 500) : 500) * i.quantity, 0);

  const { data: store } = await supabase.from("stores").select("order_prefix").eq("tenant_id", ctx.tenantId).maybeSingle();
  const setup = await getShippingSetup(ctx.tenantId);
  const created = await setup.provider.createShipment(
    {
      orderId: o.id,
      orderNumber: `${store?.order_prefix ?? "#"}${o.order_number}`,
      placedAt: o.placed_at,
      paymentMethod: o.payment_method === "cod" ? "cod" : "online",
      grandTotal: toMinor(o.grand_total),
      subtotal: toMinor(o.subtotal),
      discountTotal: toMinor(o.discount_total),
      shippingTotal: toMinor(o.shipping_total),
      email: o.email,
      phone: o.phone,
      address,
      items: (o.order_items ?? []).map((i) => ({ title: i.product_title, sku: i.sku, quantity: i.quantity, unitPrice: toMinor(i.unit_price), hsn: i.hsn_code })),
      weightGrams,
    },
    { pickupLocation: setup.pickupLocation },
  );

  const { data: row, error: insertError } = await supabase
    .from("shipments")
    .insert({
      tenant_id: ctx.tenantId,
      order_id: o.id,
      provider: created.provider,
      provider_ref: created.providerRef,
      carrier: created.carrier,
      tracking_number: created.trackingNumber,
      tracking_url: created.trackingUrl,
      status: "pending",
      weight_grams: weightGrams,
      metadata: created.metadata,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    logger.error("shipping.record_failed", { tenantId: ctx.tenantId, orderId, providerRef: created.providerRef, error: insertError?.message });
    throw insertError ? mapDbError(insertError) : new AppError("INTERNAL");
  }
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "order.shipment_created",
    entityType: "order",
    entityId: o.id,
    metadata: { provider: created.provider, provider_ref: created.providerRef },
  });
  return { ...created, shipmentId: row.id };
}

// ------------------------------------------------------------------ after booking

type ShipmentRow = { id: string; order_id: string; provider: string; provider_ref: string | null; tracking_number: string | null; metadata: unknown; status: string };

async function loadShipment(ctx: TenantContext, shipmentId: string): Promise<{ row: ShipmentRow; provider: ShippingProvider }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("shipments").select("id, order_id, provider, provider_ref, tracking_number, metadata, status").eq("tenant_id", ctx.tenantId).eq("id", shipmentId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  if (data.provider !== "shiprocket" && data.provider !== "delhivery") throw new AppError("CONFLICT", { message: "This shipment is fulfilled manually." });
  const setup = await getShippingSetup(ctx.tenantId, data.provider);
  if (setup.provider.id !== data.provider) throw new AppError("CONFLICT", { message: `${data.provider === "shiprocket" ? "Shiprocket" : "Delhivery"} is no longer connected. Reconnect it in Settings → Shipping.` });
  return { row: data, provider: setup.provider };
}
const refOf = (r: ShipmentRow) => ({ providerRef: r.provider_ref, trackingNumber: r.tracking_number, metadata: (r.metadata ?? {}) as Record<string, unknown> });

export async function trackShipment(ctx: TenantContext, shipmentId: string): Promise<Tracking> {
  assertPermission(ctx, "orders.read");
  const { row, provider } = await loadShipment(ctx, shipmentId);
  if (!provider.track) throw new AppError("CONFLICT", { message: "Tracking isn't available for this courier." });
  return provider.track(refOf(row));
}

export async function shipmentLabel(ctx: TenantContext, shipmentId: string): Promise<string> {
  assertPermission(ctx, "orders.write");
  const { row, provider } = await loadShipment(ctx, shipmentId);
  const url = provider.label ? await provider.label(refOf(row)) : null;
  if (!url) throw new AppError("CONFLICT", { message: "The courier hasn't generated a label yet. Try again in a minute." });
  return url;
}

export async function requestShipmentPickup(ctx: TenantContext, shipmentId: string): Promise<string> {
  assertPermission(ctx, "orders.write");
  const { row, provider } = await loadShipment(ctx, shipmentId);
  if (!provider.requestPickup) throw new AppError("CONFLICT", { message: "Schedule pickups from the courier's panel for this courier." });
  const msg = await provider.requestPickup(refOf(row));
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "order.pickup_requested", entityType: "shipment", entityId: shipmentId, metadata: { provider: row.provider } });
  return msg;
}

export async function cancelShipment(ctx: TenantContext, shipmentId: string): Promise<void> {
  assertPermission(ctx, "orders.write");
  const { row, provider } = await loadShipment(ctx, shipmentId);
  if (!provider.cancel) throw new AppError("CONFLICT", { message: "Cancel this shipment in the courier's panel." });
  await provider.cancel(refOf(row));
  const supabase = await createSupabaseServerClient();
  await supabase.from("shipments").update({ status: "cancelled" }).eq("tenant_id", ctx.tenantId).eq("id", shipmentId);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "order.shipment_cancelled", entityType: "shipment", entityId: shipmentId, metadata: { provider: row.provider } });
}
