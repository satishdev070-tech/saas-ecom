"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { requireTenant } from "@/lib/tenant/membership";
import { rateLimit } from "@/lib/rate-limit";
import { cancelShipment, createShipmentForOrder, requestShipmentPickup, shipmentLabel, trackShipment } from "./service";
import type { Tracking } from "./types";

const orderSchema = z.object({ orderId: z.uuid() });
const shipmentSchema = z.object({ shipmentId: z.uuid() });

/** Book the order with the store's default connected courier. */
export async function bookShipmentAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("shipping.book", async () => {
    const { orderId } = parseInput(orderSchema, formToObject(fd));
    const ctx = await requireTenant();
    await rateLimit("courier-api", ctx.tenantId, 60, 600);
    const s = await createShipmentForOrder(ctx, orderId);
    return s.trackingNumber ? `Booked with ${s.carrier ?? "courier"}: AWB ${s.trackingNumber}.` : "Booked. The courier will assign an AWB shortly.";
  });
  if (result.ok) refresh();
  return result;
}

export async function trackShipmentAction(_prev: ActionResult<Tracking> | null, fd: FormData): Promise<ActionResult<Tracking>> {
  return runAction("shipping.track", async () => {
    const { shipmentId } = parseInput(shipmentSchema, formToObject(fd));
    const ctx = await requireTenant();
    await rateLimit("courier-api", ctx.tenantId, 60, 600);
    return trackShipment(ctx, shipmentId);
  });
}

export async function shipmentLabelAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return runAction("shipping.label", async () => {
    const { shipmentId } = parseInput(shipmentSchema, formToObject(fd));
    const ctx = await requireTenant();
    await rateLimit("courier-api", ctx.tenantId, 60, 600);
    return shipmentLabel(ctx, shipmentId);
  });
}

export async function requestPickupAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return runAction("shipping.pickup", async () => {
    const { shipmentId } = parseInput(shipmentSchema, formToObject(fd));
    const ctx = await requireTenant();
    await rateLimit("courier-api", ctx.tenantId, 60, 600);
    return requestShipmentPickup(ctx, shipmentId);
  });
}

export async function cancelShipmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("shipping.cancel", async () => {
    const { shipmentId } = parseInput(shipmentSchema, formToObject(fd));
    const ctx = await requireTenant();
    await cancelShipment(ctx, shipmentId);
  });
  if (result.ok) refresh();
  return result;
}
