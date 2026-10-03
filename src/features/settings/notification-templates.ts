/**
 * Notification template catalogue + renderer (pure). Placeholders use {{name}} syntax.
 * The sender (src/features/notifications) should render with renderTemplate() so the
 * seller preview matches what customers receive. Values are inserted as TEXT; an HTML
 * email renderer must escape them.
 */

export const TEMPLATE_KEYS = [
  "order_placed",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "refund_processed",
  "return_update",
  "welcome",
  "abandoned_cart",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const TEMPLATE_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const PLACEHOLDERS = {
  store_name: "Your store name",
  store_url: "Link to your store",
  customer_name: "Customer's first name",
  order_number: "Order number, e.g. #1042",
  order_total: "Order total, e.g. ₹2,499",
  order_url: "Link to the order page",
  carrier: "Courier name",
  tracking_number: "AWB / tracking number",
  tracking_url: "Tracking link",
  refund_amount: "Refunded amount",
  return_status: "Return status",
  cart_url: "Link back to the cart",
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;

export const TEMPLATE_META: Record<TemplateKey, { label: string; description: string; placeholders: Placeholder[] }> = {
  order_placed: { label: "Order confirmation", description: "Sent when an order is placed (COD) or paid (online).", placeholders: ["store_name", "customer_name", "order_number", "order_total", "order_url"] },
  order_shipped: { label: "Order shipped", description: "Sent when you mark an order shipped.", placeholders: ["store_name", "customer_name", "order_number", "carrier", "tracking_number", "tracking_url", "order_url"] },
  order_delivered: { label: "Order delivered", description: "Sent when an order is marked delivered.", placeholders: ["store_name", "customer_name", "order_number", "order_url"] },
  order_cancelled: { label: "Order cancelled", description: "Sent when an order is cancelled.", placeholders: ["store_name", "customer_name", "order_number", "order_total"] },
  refund_processed: { label: "Refund processed", description: "Sent when a refund is issued.", placeholders: ["store_name", "customer_name", "order_number", "refund_amount"] },
  return_update: { label: "Return update", description: "Sent when a return is approved, rejected or received.", placeholders: ["store_name", "customer_name", "order_number", "return_status"] },
  welcome: { label: "Welcome", description: "Sent when a customer creates an account.", placeholders: ["store_name", "customer_name", "store_url"] },
  abandoned_cart: { label: "Abandoned cart", description: "Reminder for carts left at checkout.", placeholders: ["store_name", "customer_name", "cart_url"] },
};

export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body: string }> = {
  order_placed: { subject: "Order {{order_number}} confirmed", body: "Hi {{customer_name}},\n\nThank you for shopping with {{store_name}}! Your order {{order_number}} for {{order_total}} is confirmed.\n\nView your order: {{order_url}}" },
  order_shipped: { subject: "Order {{order_number}} is on its way", body: "Hi {{customer_name}},\n\nGood news: your order {{order_number}} has shipped with {{carrier}}.\nTracking number: {{tracking_number}}\nTrack it here: {{tracking_url}}" },
  order_delivered: { subject: "Order {{order_number}} delivered", body: "Hi {{customer_name}},\n\nYour order {{order_number}} has been delivered. We hope you love it!\n\n{{store_name}}" },
  order_cancelled: { subject: "Order {{order_number}} cancelled", body: "Hi {{customer_name}},\n\nYour order {{order_number}} ({{order_total}}) has been cancelled. If you paid online, any refund will reach you in 5–7 working days.\n\n{{store_name}}" },
  refund_processed: { subject: "Refund for order {{order_number}}", body: "Hi {{customer_name}},\n\nWe've processed a refund of {{refund_amount}} for order {{order_number}}.\n\n{{store_name}}" },
  return_update: { subject: "Update on your return for {{order_number}}", body: "Hi {{customer_name}},\n\nYour return for order {{order_number}} is now: {{return_status}}.\n\n{{store_name}}" },
  welcome: { subject: "Welcome to {{store_name}}", body: "Hi {{customer_name}},\n\nThanks for creating an account with {{store_name}}. Start shopping: {{store_url}}" },
  abandoned_cart: { subject: "You left something behind", body: "Hi {{customer_name}},\n\nYour cart at {{store_name}} is waiting for you: {{cart_url}}" },
};

export const SAMPLE_VALUES: Record<Placeholder, string> = {
  store_name: "Aangan Jaipur",
  store_url: "https://aangan.paliya.store",
  customer_name: "Neha",
  order_number: "#1042",
  order_total: "₹2,499",
  order_url: "https://aangan.paliya.store/orders/1042",
  carrier: "Delhivery",
  tracking_number: "1234567890",
  tracking_url: "https://www.delhivery.com/track/package/1234567890",
  refund_amount: "₹2,499",
  return_status: "Approved",
  cart_url: "https://aangan.paliya.store/cart",
};

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replaces {{known_placeholder}} with its value; unknown placeholders are left untouched. */
export function renderTemplate(template: string, values: Partial<Record<string, string>>): string {
  return template.replace(TOKEN, (m, key: string) => (key in PLACEHOLDERS && values[key] !== undefined ? values[key]! : m));
}

/** Placeholders used in a template that are not recognised (typos). */
export function unknownPlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (!(m[1]! in PLACEHOLDERS)) out.add(m[1]!);
  return [...out];
}
