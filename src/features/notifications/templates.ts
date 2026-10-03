/**
 * Notification templates. PURE (unit tested). Seller-authored templates are treated as PLAIN
 * TEXT: the whole template is HTML-escaped, then `{{placeholder}}` values (also escaped) are
 * substituted, so neither a seller nor a shopper-supplied value (name, address) can inject markup.
 */

export const ORDER_NOTIFICATION_KEYS = [
  "order_placed",
  "payment_failed",
  "order_shipped",
  "out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "refund_processed",
  "return_update",
  "abandoned_cart",
] as const;
export type OrderNotificationKey = (typeof ORDER_NOTIFICATION_KEYS)[number];

/** Keys a seller can override in `notification_templates` (DB CHECK list). */
export const CUSTOMISABLE_KEYS: ReadonlySet<string> = new Set(["order_placed", "order_shipped", "order_delivered", "order_cancelled", "refund_processed", "return_update", "abandoned_cart"]);

export const PLACEHOLDERS = [
  "store_name",
  "store_url",
  "customer_name",
  "order_number",
  "order_total",
  "order_url",
  "payment_method",
  "carrier",
  "tracking_number",
  "tracking_url",
  "refund_amount",
  "cancel_reason",
  "return_status",
  "payment_url",
  "cart_url",
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type TemplateVars = Partial<Record<Placeholder, string | null | undefined>>;

export type Template = { subject: string; body: string };

export const DEFAULT_TEMPLATES: Record<OrderNotificationKey, Template> = {
  order_placed: {
    subject: "Order {{order_number}} received — {{store_name}}",
    body: "Hi {{customer_name}},\n\nThank you for shopping with {{store_name}}! We've received your order {{order_number}} for {{order_total}} ({{payment_method}}).\n\nWe'll let you know as soon as it ships.",
  },
  payment_failed: {
    subject: "Payment didn't go through for order {{order_number}}",
    body: "Hi {{customer_name}},\n\nYour payment of {{order_total}} for order {{order_number}} at {{store_name}} didn't go through, so the order isn't confirmed yet. No money was taken for this attempt — if your bank did debit you, it will be reversed automatically.\n\nYou can try the payment again from the link below.",
  },
  order_shipped: {
    subject: "Your order {{order_number}} has shipped",
    body: "Hi {{customer_name}},\n\nGood news — order {{order_number}} is on its way via {{carrier}}.\nTracking number: {{tracking_number}}\n{{tracking_url}}",
  },
  out_for_delivery: {
    subject: "Order {{order_number}} is out for delivery",
    body: "Hi {{customer_name}},\n\nYour order {{order_number}} is out for delivery today with {{carrier}}. Please keep your phone handy for the delivery partner.",
  },
  order_delivered: {
    subject: "Order {{order_number}} delivered",
    body: "Hi {{customer_name}},\n\nYour order {{order_number}} has been delivered. We hope you love it! If anything isn't right, you can request a return from your account.",
  },
  order_cancelled: {
    subject: "Order {{order_number}} cancelled",
    body: "Hi {{customer_name}},\n\nYour order {{order_number}} has been cancelled. {{cancel_reason}}\n\nIf you paid online, any amount charged will be refunded to the original payment method.",
  },
  refund_processed: {
    subject: "Refund processed for order {{order_number}}",
    body: "Hi {{customer_name}},\n\nWe've processed a refund of {{refund_amount}} for order {{order_number}}. Depending on your bank it can take 5–7 working days to show up.",
  },
  return_update: {
    subject: "Update on your return for order {{order_number}}",
    body: "Hi {{customer_name}},\n\nThere's an update on your return request for order {{order_number}}: {{return_status}}. Open your order to see the details.",
  },
  abandoned_cart: {
    subject: "You left something at {{store_name}}",
    body: "Hi {{customer_name}},\n\nYou left a few things in your bag at {{store_name}}. They're still waiting for you — pick up where you left off whenever you're ready.",
  },
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

const PLACEHOLDER_RE = /\{\{\s*([a-z_]{1,40})\s*\}\}/g;
const KNOWN: ReadonlySet<string> = new Set(PLACEHOLDERS);

/** Plain-text substitution (for subjects and the text/plain part). Unknown placeholders render empty. */
export function renderText(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER_RE, (_m, key: string) => (KNOWN.has(key) ? (vars[key as Placeholder] ?? "") : "")).trim();
}

/** Subject lines: single line, no control characters (header-injection safe), max 200 chars. */
export function renderSubject(template: string, vars: TemplateVars): string {
  return renderText(template, vars)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 200)
    .trim();
}

/** HTML body: escape template AND values, then turn blank-line paragraphs / newlines into markup. */
export function renderHtmlBody(template: string, vars: TemplateVars): string {
  const escapedTemplate = escapeHtml(template);
  const substituted = escapedTemplate.replace(PLACEHOLDER_RE, (_m, key: string) => (KNOWN.has(key) ? escapeHtml(vars[key as Placeholder] ?? "") : ""));
  return substituted
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function isSafeEmailUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname.endsWith(".localhost")));
  } catch {
    return false;
  }
}
