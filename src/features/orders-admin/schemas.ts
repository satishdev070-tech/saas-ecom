import { z } from "zod";
import { isDateKey } from "@/features/analytics/dates";
import { optionalHttpsUrl, optionalText, rupees } from "@/features/settings/fields";
import { FULFILLMENT_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, RETURN_STATUSES } from "./format";

/** Next searchParams value → first string. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().catch(undefined);
const dateKey = z
  .string()
  .optional()
  .transform((v) => (isDateKey(v) ? v : undefined));
const page = z.coerce.number().int().min(1).max(10_000).catch(1);

export const orderFiltersSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  status: optionalEnum(ORDER_STATUSES),
  payment: optionalEnum(PAYMENT_STATUSES),
  fulfillment: optionalEnum(FULFILLMENT_STATUSES),
  method: optionalEnum(PAYMENT_METHODS),
  from: dateKey,
  to: dateKey,
  page,
});
export type OrderFilters = z.infer<typeof orderFiltersSchema>;

export function parseOrderFilters(sp: SearchParamsRecord): OrderFilters {
  return orderFiltersSchema.parse({
    q: firstParam(sp.q),
    status: firstParam(sp.status),
    payment: firstParam(sp.payment),
    fulfillment: firstParam(sp.fulfillment),
    method: firstParam(sp.method),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    page: firstParam(sp.page) ?? 1,
  });
}

export const returnFiltersSchema = z.object({ status: optionalEnum(RETURN_STATUSES), page });

const orderId = z.uuid("Invalid order");

export const fulfillmentSchema = z
  .object({
    orderId,
    status: z.enum(["packed", "shipped", "delivered", "rto"]),
    carrier: optionalText(80),
    tracking: optionalText(80),
    trackingUrl: optionalHttpsUrl,
  })
  .superRefine((v, ctx) => {
    if (v.status === "shipped") {
      if (!v.carrier) ctx.addIssue({ code: "custom", path: ["carrier"], message: "Enter the courier" });
      if (!v.tracking) ctx.addIssue({ code: "custom", path: ["tracking"], message: "Enter the tracking / AWB number" });
    }
  });

export const cancelOrderSchema = z.object({
  orderId,
  reason: z.string({ error: "Enter a reason" }).trim().min(3, "Enter a reason").max(500),
});

export const orderIdSchema = z.object({ orderId });

export const staffNoteSchema = z.object({ orderId, staffNote: optionalText(2000) });

/** Order emails a seller may re-send from the order page (keys of sendOrderNotification). */
export const RESENDABLE_NOTIFICATIONS = ["order_placed", "order_shipped", "order_delivered", "order_cancelled"] as const;
export const resendNotificationSchema = z.object({ orderId, key: z.enum(RESENDABLE_NOTIFICATIONS, { error: "Choose an email" }) });

export const orderNoteSchema = z.object({
  orderId,
  message: z.string({ error: "Write a note" }).trim().min(1, "Write a note").max(1000),
});

export const refundSchema = z.object({
  orderId,
  returnId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  amount: rupees.refine((m) => m > 0, "Enter an amount greater than 0"),
  reason: z.string({ error: "Enter a reason" }).trim().min(3, "Enter a reason").max(500),
});

export const returnStatusSchema = z.object({
  returnId: z.uuid(),
  status: z.enum(["approved", "rejected", "received", "closed"]),
  note: optionalText(2000),
});

/** Allowed next statuses for a return (mirrors public.update_return_status). */
export function nextReturnStatuses(status: string): ("approved" | "rejected" | "received" | "closed")[] {
  if (status === "requested") return ["approved", "rejected"];
  if (status === "approved") return ["received"];
  if (status === "received" || status === "refunded") return ["closed"];
  return [];
}

/** Fulfilment actions offered for an order in its current state (mirrors public.update_fulfillment). */
export function nextFulfillmentActions(o: { status: string; fulfillment_status: string }): ("packed" | "shipped" | "delivered" | "rto")[] {
  if (o.status === "cancelled" || o.status === "pending") return [];
  switch (o.fulfillment_status) {
    case "unfulfilled":
      return ["packed", "shipped"];
    case "packed":
      return ["shipped"];
    case "shipped":
      return ["delivered", "rto"];
    default:
      return [];
  }
}
