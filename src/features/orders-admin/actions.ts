"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { refundOrder } from "@/features/payments/refunds";
import { emit, eventIdempotencyKey, type NotificationEvent } from "@/features/notifications/events";
import { randomToken } from "@/lib/crypto";
import { formError, rpcError } from "@/features/settings/action-errors";
import {
  cancelOrderSchema,
  fulfillmentSchema,
  orderIdSchema,
  orderNoteSchema,
  refundSchema,
  RESENDABLE_NOTIFICATIONS,
  resendNotificationSchema,
  returnStatusSchema,
  staffNoteSchema,
} from "./schemas";
import { refundableMinor } from "./format";

const FULFILLMENT_ERRORS = [
  [/order is cancelled/, "This order is cancelled."],
  [/awaiting payment/, "This order is still awaiting payment."],
  [/tracking url must be https/, "Tracking links must start with https://"],
] as const;

const RETURN_ERRORS = [[/invalid status transition/, "That change isn't allowed from the return's current status."]] as const;

/** Event for a manual "re-send email" (customer email only; no owner alert, no WhatsApp). */
function resendEvent(tenantId: string, orderId: string, key: (typeof RESENDABLE_NOTIFICATIONS)[number], paymentStatus: string): NotificationEvent {
  const resendNonce = randomToken(8);
  switch (key) {
    case "order_placed":
      return { type: "order.placed", tenantId, orderId, payment: paymentStatus === "paid" ? "paid" : "cod", resendNonce };
    case "order_shipped":
      return { type: "shipment.updated", tenantId, orderId, status: "shipped", resendNonce };
    case "order_delivered":
      return { type: "shipment.updated", tenantId, orderId, status: "delivered", resendNonce };
    case "order_cancelled":
      return { type: "order.status_changed", tenantId, orderId, status: "cancelled", resendNonce };
  }
}

function revalidateOrder(orderId: string) {
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard");
}

/** Loads an order of the ACTIVE tenant (explicit tenant filter on top of RLS) or throws NOT_FOUND. */
async function ownOrder(tenantId: string, orderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("orders").select("id, status, payment_status, grand_total, refunded_total").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return { supabase, order: data };
}

export async function updateFulfillmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.updateFulfillment", async () => {
    const input = parseInput(fulfillmentSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const { supabase } = await ownOrder(ctx.tenantId, input.orderId);
    // The RPC re-checks orders.write on the order's own tenant and audits the change.
    const { error } = await supabase.rpc("update_fulfillment", {
      p_order: input.orderId,
      p_status: input.status,
      p_carrier: input.carrier as string,
      p_tracking: input.tracking as string,
      p_tracking_url: input.trackingUrl as string,
    });
    if (error) throw rpcError(error, FULFILLMENT_ERRORS);
    if (input.status === "shipped" || input.status === "delivered") emit({ type: "shipment.updated", tenantId: ctx.tenantId, orderId: input.orderId, status: input.status });
    revalidateOrder(input.orderId);
  });
}

export async function cancelOrderAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.cancel", async () => {
    const input = parseInput(cancelOrderSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.cancel");
    const { supabase, order } = await ownOrder(ctx.tenantId, input.orderId);
    if (order.status === "cancelled") throw formError("This order is already cancelled.");
    // cancel_order releases/restocks inventory and writes the audit log entry.
    const { error } = await supabase.rpc("cancel_order", { p_order: input.orderId, p_reason: input.reason });
    if (error) throw rpcError(error);
    emit({ type: "order.status_changed", tenantId: ctx.tenantId, orderId: input.orderId, status: "cancelled", cancelReason: input.reason });
    revalidateOrder(input.orderId);
  });
}

/** Internal timeline comment (never shown to the customer). */
export async function addOrderNoteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.addNote", async () => {
    const input = parseInput(orderNoteSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const { supabase } = await ownOrder(ctx.tenantId, input.orderId);
    const { error } = await supabase.from("order_events").insert({
      tenant_id: ctx.tenantId,
      order_id: input.orderId,
      type: "note",
      message: input.message,
      actor_user_id: ctx.user.id,
      visible_to_customer: false,
    });
    if (error) throw mapDbError(error);
    revalidatePath(`/dashboard/orders/${input.orderId}`);
  });
}

/** The single pinned staff note on the order (orders.staff_note). */
export async function saveStaffNoteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.saveStaffNote", async () => {
    const input = parseInput(staffNoteSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const { supabase } = await ownOrder(ctx.tenantId, input.orderId);
    const { error } = await supabase
      .from("orders")
      .update({ staff_note: input.staffNote ?? null })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", input.orderId);
    if (error) throw mapDbError(error);
    revalidatePath(`/dashboard/orders/${input.orderId}`);
  });
}

export async function refundOrderAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.refund", async () => {
    const input = parseInput(refundSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.refund");
    const { supabase, order } = await ownOrder(ctx.tenantId, input.orderId);
    const refundable = refundableMinor(order);
    if (refundable <= 0) throw formError("Nothing is left to refund on this order.");
    if (input.amount > refundable) throw new AppError("VALIDATION", { fieldErrors: { amount: ["The refund exceeds the amount still refundable."] } });
    if (input.returnId) {
      const { data: ret } = await supabase.from("returns").select("id").eq("tenant_id", ctx.tenantId).eq("id", input.returnId).eq("order_id", input.orderId).maybeSingle();
      if (!ret) throw new AppError("NOT_FOUND");
    }
    // Agent C's refundOrder: provider refund (Razorpay for online payments, manual for COD),
    // svc_record_refund, audit "order.refunded" and the refund_processed email.
    await refundOrder({ ctx, orderId: input.orderId, amountMinor: input.amount, reason: input.reason, returnId: input.returnId ?? null });
    revalidateOrder(input.orderId);
    if (input.returnId) {
      revalidatePath("/dashboard/returns");
      revalidatePath(`/dashboard/returns/${input.returnId}`);
    }
  });
}

export async function issueInvoiceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.issueInvoice", async () => {
    const input = parseInput(orderIdSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const { supabase } = await ownOrder(ctx.tenantId, input.orderId);
    // issue_order_invoice is idempotent (one invoice per order) and audits the first issue.
    const { error } = await supabase.rpc("issue_order_invoice", { p_order: input.orderId });
    if (error) throw rpcError(error);
    revalidatePath(`/dashboard/orders/${input.orderId}`);
    revalidatePath(`/dashboard/orders/${input.orderId}/invoice`);
  });
}

/** Re-sends an order email to the customer (e.g. they lost the shipping update). */
export async function resendNotificationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("orders.resendNotification", async () => {
    const input = parseInput(resendNotificationSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const { order } = await ownOrder(ctx.tenantId, input.orderId);
    await rateLimit("order-notify", `${ctx.tenantId}:${input.orderId}`, 5, 3600);
    // Runs inline so the seller learns whether it actually went out.
    const event = resendEvent(ctx.tenantId, input.orderId, input.key, order.payment_status);
    const { channel } = await import("@/features/notifications/email/channel");
    const outcome = (await channel.handle(event, { idempotencyKey: `${eventIdempotencyKey(event)}:email` })) ?? { status: "skipped" as const };
    if (outcome.status === "failed") throw formError("The email couldn't be sent. Try again in a few minutes.");
    if (outcome.status === "skipped") throw formError(outcome.detail === "email provider not configured" ? "Email sending isn't set up yet, so nothing was sent." : outcome.detail === "no customer email" ? "This order has no customer email." : "Nothing was sent for this order.");
    const supabase = await createSupabaseServerClient();
    await supabase.from("order_events").insert({
      tenant_id: ctx.tenantId,
      order_id: input.orderId,
      type: "notification_resent",
      message: `Email re-sent: ${input.key.replace(/_/g, " ")}`,
      actor_user_id: ctx.user.id,
      visible_to_customer: false,
    });
    revalidatePath(`/dashboard/orders/${input.orderId}`);
  });
}

export async function updateReturnStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction("returns.updateStatus", async () => {
    const input = parseInput(returnStatusSchema, formToObject(fd));
    const ctx = await requireTenant();
    assertPermission(ctx, "orders.write");
    const supabase = await createSupabaseServerClient();
    const { data: ret } = await supabase.from("returns").select("id, order_id").eq("tenant_id", ctx.tenantId).eq("id", input.returnId).maybeSingle();
    if (!ret) throw new AppError("NOT_FOUND");
    // update_return_status validates the transition, restocks on "received" and audits.
    const { error } = await supabase.rpc("update_return_status", { p_return: input.returnId, p_status: input.status, p_note: input.note as string });
    if (error) throw rpcError(error, RETURN_ERRORS);
    emit({ type: "return.updated", tenantId: ctx.tenantId, orderId: ret.order_id, returnId: input.returnId, status: input.status });
    revalidatePath("/dashboard/returns");
    revalidatePath(`/dashboard/returns/${input.returnId}`);
    revalidatePath(`/dashboard/orders/${ret.order_id}`);
  });
}
