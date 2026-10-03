/** Per-store email toggles (stored in `email_preferences.settings`). PURE. */

export const EMAIL_PREFERENCE_KEYS = [
  "order_placed",
  "owner_new_order",
  "payment_failed",
  "order_shipped",
  "out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "refund_processed",
  "return_update",
  "abandoned_cart",
] as const;
export type EmailPreferenceKey = (typeof EMAIL_PREFERENCE_KEYS)[number];
export type EmailPreferences = Record<EmailPreferenceKey, boolean>;

export const EMAIL_PREFERENCE_META: Record<EmailPreferenceKey, { label: string; hint: string; audience: "customer" | "store"; defaultOn: boolean }> = {
  order_placed: { label: "Order confirmation", hint: "When a COD order is placed or an online payment succeeds.", audience: "customer", defaultOn: true },
  owner_new_order: { label: "New-order alert to you", hint: "Sent to your store email for every confirmed order.", audience: "store", defaultOn: true },
  payment_failed: { label: "Payment failed", hint: "When an online payment attempt fails, with a link to retry.", audience: "customer", defaultOn: true },
  order_shipped: { label: "Order shipped", hint: "With the courier and tracking link.", audience: "customer", defaultOn: true },
  out_for_delivery: { label: "Out for delivery", hint: "When the courier reports the package is out for delivery.", audience: "customer", defaultOn: true },
  order_delivered: { label: "Delivered", hint: "When the order is marked delivered.", audience: "customer", defaultOn: true },
  order_cancelled: { label: "Order cancelled", hint: "When you or the customer cancels.", audience: "customer", defaultOn: true },
  refund_processed: { label: "Refund processed", hint: "When a refund is issued.", audience: "customer", defaultOn: true },
  return_update: { label: "Return updates", hint: "When a return is requested, approved, rejected or received.", audience: "customer", defaultOn: true },
  abandoned_cart: { label: "Abandoned-cart reminder", hint: "One reminder to signed-in shoppers who left items in their bag.", audience: "customer", defaultOn: false },
};

export function resolveEmailPreferences(settings: unknown): EmailPreferences {
  const s = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const out = {} as EmailPreferences;
  for (const k of EMAIL_PREFERENCE_KEYS) out[k] = typeof s[k] === "boolean" ? (s[k] as boolean) : EMAIL_PREFERENCE_META[k].defaultOn;
  return out;
}
