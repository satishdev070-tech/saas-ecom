/**
 * Email templates. PURE (unit tested): data in, { subject, html, text } out.
 *
 * Customer order emails use the seller-editable wording from `notification_templates` when
 * present (treated as plain text — see ../templates.ts), wrapped in the store-branded layout
 * with order details, items and totals. Money arrives as paise and is formatted with
 * `formatMoney` (₹, en-IN). No env or secrets are read here.
 */
import { formatMoney } from "@/lib/money";
import { DEFAULT_TEMPLATES, escapeHtml, isSafeEmailUrl, renderHtmlBody, renderSubject, renderText, type OrderNotificationKey, type Template, type TemplateVars } from "../templates";
import { renderLayout, renderLayoutText, type EmailBrand, type EmailInfoRow, type EmailLine, type RenderedEmail } from "./layout";

export type { RenderedEmail, EmailBrand } from "./layout";

export type OrderEmailItem = { title: string; variant?: string | null; quantity: number; totalMinor: number };

export type OrderEmailData = {
  brand: EmailBrand;
  customerName: string;
  orderNumber: string;
  orderUrl: string | null;
  paymentUrl?: string | null;
  paymentMethod: "cod" | "online";
  items: OrderEmailItem[];
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  /** COD handling fee, paise (0 when none). */
  codFeeMinor?: number;
  /** Tax added on top (only when prices exclude tax), paise. */
  taxMinor?: number;
  totalMinor: number;
  shippingAddress?: string[];
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  refundAmountMinor?: number | null;
  cancelReason?: string | null;
  returnStatus?: string | null;
};

export type CustomerOrderKind = Exclude<OrderNotificationKey, "abandoned_cart">;

const HEADINGS: Record<CustomerOrderKind, string> = {
  order_placed: "Thank you for your order",
  payment_failed: "Your payment didn't go through",
  order_shipped: "Your order is on its way",
  out_for_delivery: "Out for delivery today",
  order_delivered: "Your order has been delivered",
  order_cancelled: "Your order has been cancelled",
  refund_processed: "Your refund is on its way",
  return_update: "Update on your return",
};

function linesOf(items: OrderEmailItem[]): EmailLine[] {
  return items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, total: formatMoney(i.totalMinor) }));
}

function totalsOf(d: OrderEmailData): EmailInfoRow[] {
  const rows: EmailInfoRow[] = [{ label: "Subtotal", value: formatMoney(d.subtotalMinor) }];
  if (d.discountMinor > 0) rows.push({ label: "Discount", value: `−${formatMoney(d.discountMinor)}` });
  rows.push({ label: "Shipping", value: d.shippingMinor > 0 ? formatMoney(d.shippingMinor) : "Free" });
  if ((d.codFeeMinor ?? 0) > 0) rows.push({ label: "COD fee", value: formatMoney(d.codFeeMinor!) });
  if ((d.taxMinor ?? 0) > 0) rows.push({ label: "Tax", value: formatMoney(d.taxMinor!) });
  rows.push({ label: d.paymentMethod === "cod" ? "To pay on delivery" : "Total", value: formatMoney(d.totalMinor) });
  return rows;
}

/** URL placeholders only ever carry https (or local dev) links. */
const url = (u: string | null | undefined) => (u && isSafeEmailUrl(u) ? u : "");

function varsOf(d: OrderEmailData): TemplateVars {
  return {
    store_name: d.brand.storeName,
    store_url: url(d.brand.storeUrl),
    customer_name: d.customerName,
    order_number: d.orderNumber,
    order_total: formatMoney(d.totalMinor),
    order_url: url(d.orderUrl),
    payment_method: d.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online",
    carrier: d.carrier || "our courier partner",
    tracking_number: d.trackingNumber || "—",
    tracking_url: url(d.trackingUrl),
    refund_amount: formatMoney(d.refundAmountMinor ?? 0),
    cancel_reason: d.cancelReason ?? "",
    return_status: d.returnStatus ?? "",
    payment_url: url(d.paymentUrl),
  };
}

function pickTemplate(key: OrderNotificationKey, custom?: Partial<Template> | null): Template {
  const d = DEFAULT_TEMPLATES[key];
  return custom?.body ? { subject: custom.subject || d.subject, body: custom.body } : d;
}

/** Customer-facing order lifecycle email. */
export function renderCustomerOrderEmail(kind: CustomerOrderKind, d: OrderEmailData, custom?: Partial<Template> | null): RenderedEmail {
  const tpl = pickTemplate(kind, custom);
  const vars = varsOf(d);
  const subject = renderSubject(tpl.subject, vars);
  const heading = HEADINGS[kind];

  const info: EmailInfoRow[] = [{ label: "Order", value: d.orderNumber }];
  let lines: EmailLine[] | undefined;
  let totals: EmailInfoRow[] | undefined;
  let cta: { label: string; url: string | null | undefined } = { label: "View your order", url: d.orderUrl };
  let footnote: string | undefined;

  switch (kind) {
    case "order_placed":
      info.push({ label: "Payment", value: d.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online" });
      if (d.shippingAddress?.length) info.push({ label: "Delivering to", value: d.shippingAddress.join(", ") });
      lines = linesOf(d.items);
      totals = totalsOf(d);
      if (d.paymentMethod === "cod") footnote = `Please keep ${formatMoney(d.totalMinor)} ready for the delivery partner.`;
      break;
    case "payment_failed":
      info.push({ label: "Amount", value: formatMoney(d.totalMinor) });
      cta = { label: "Try payment again", url: d.paymentUrl ?? d.orderUrl };
      break;
    case "order_shipped":
    case "out_for_delivery":
      if (d.carrier) info.push({ label: "Courier", value: d.carrier });
      if (d.trackingNumber) info.push({ label: "Tracking number", value: d.trackingNumber });
      if (d.trackingUrl) cta = { label: "Track your package", url: d.trackingUrl };
      if (d.paymentMethod === "cod") info.push({ label: "To pay on delivery", value: formatMoney(d.totalMinor) });
      break;
    case "order_cancelled":
      if (d.cancelReason) info.push({ label: "Reason", value: d.cancelReason });
      break;
    case "refund_processed":
      info.push({ label: "Refund amount", value: formatMoney(d.refundAmountMinor ?? 0) });
      break;
    case "return_update":
      if (d.returnStatus) info.push({ label: "Return status", value: d.returnStatus });
      break;
    case "order_delivered":
      break;
  }

  const layout = { brand: d.brand, heading, preheader: subject, info, lines, totals, cta, footnote };
  // Seller templates often include {{tracking_url}} / {{order_url}} inline; the text part keeps them.
  return {
    subject,
    html: renderLayout({ ...layout, bodyHtml: renderHtmlBody(tpl.body, vars) }),
    text: renderLayoutText({ ...layout, bodyText: renderText(tpl.body, vars) }),
  };
}

/** New-order alert to the store owner (store contact email). */
export function renderOwnerNewOrderEmail(d: OrderEmailData & { dashboardUrl: string | null; customerEmail?: string | null; customerPhone?: string | null }): RenderedEmail {
  const total = formatMoney(d.totalMinor);
  const subject = renderSubject(`New order ${d.orderNumber} — ${total}${d.paymentMethod === "cod" ? " (COD)" : ""}`, {});
  const info: EmailInfoRow[] = [
    { label: "Order", value: d.orderNumber },
    { label: "Customer", value: d.customerName },
    { label: "Payment", value: d.paymentMethod === "cod" ? "Cash on Delivery — collect on delivery" : "Paid online" },
  ];
  if (d.customerPhone) info.push({ label: "Phone", value: d.customerPhone });
  if (d.customerEmail) info.push({ label: "Email", value: d.customerEmail });
  if (d.shippingAddress?.length) info.push({ label: "Ship to", value: d.shippingAddress.join(", ") });
  const bodyText = `You have a new order on ${d.brand.storeName}. Pack it and book the shipment from your dashboard.`;
  const layout = {
    brand: d.brand,
    heading: `New order ${d.orderNumber}`,
    preheader: `${d.items.length} item${d.items.length === 1 ? "" : "s"} · ${total}`,
    info,
    lines: linesOf(d.items),
    totals: totalsOf(d),
    cta: { label: "Open in dashboard", url: d.dashboardUrl },
    footnote: "You get this because new-order alerts are on in Settings → Notifications.",
  };
  return { subject, html: renderLayout({ ...layout, bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(bodyText)}</p>` }), text: renderLayoutText({ ...layout, bodyText }) };
}

export type AbandonedCartData = { brand: EmailBrand; customerName: string; items: OrderEmailItem[]; subtotalMinor: number; cartUrl: string | null };

export function renderAbandonedCartEmail(d: AbandonedCartData, custom?: Partial<Template> | null): RenderedEmail {
  const tpl = pickTemplate("abandoned_cart", custom);
  const vars: TemplateVars = { store_name: d.brand.storeName, store_url: url(d.brand.storeUrl), customer_name: d.customerName, cart_url: url(d.cartUrl), order_total: formatMoney(d.subtotalMinor) };
  const subject = renderSubject(tpl.subject, vars);
  const layout = {
    brand: d.brand,
    heading: "Still thinking it over?",
    preheader: subject,
    lines: linesOf(d.items),
    totals: [{ label: "Subtotal", value: formatMoney(d.subtotalMinor) }],
    cta: { label: "Return to your bag", url: d.cartUrl },
    footnote: "Prices and stock may change until you check out.",
  };
  return { subject, html: renderLayout({ ...layout, bodyHtml: renderHtmlBody(tpl.body, vars) }), text: renderLayoutText({ ...layout, bodyText: renderText(tpl.body, vars) }) };
}

export function renderTeamInviteEmail(d: { brand: EmailBrand; inviterName: string; roleName: string; acceptUrl: string; expiresInDays: number }): RenderedEmail {
  const subject = renderSubject(`You're invited to ${d.brand.storeName}`, {});
  const bodyText = `${d.inviterName} invited you to help run ${d.brand.storeName} as ${d.roleName}.\n\nAccept the invitation with the button below. The link expires in ${d.expiresInDays} days and works only once.`;
  const layout = {
    brand: d.brand,
    heading: `Join ${d.brand.storeName}`,
    preheader: `${d.inviterName} invited you as ${d.roleName}`,
    cta: { label: "Accept invitation", url: d.acceptUrl },
    footnote: "If you weren't expecting this, you can ignore this email.",
  };
  const bodyHtml = bodyText
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`)
    .join("");
  return { subject, html: renderLayout({ ...layout, bodyHtml }), text: renderLayoutText({ ...layout, bodyText }) };
}

export function renderContactForwardEmail(d: { brand: EmailBrand; name: string; email: string; phone?: string | null; subject?: string | null; message: string }): RenderedEmail {
  const subject = renderSubject(`Contact form: ${d.subject || `message from ${d.name}`}`, {});
  const info: EmailInfoRow[] = [
    { label: "From", value: d.name },
    { label: "Email", value: d.email },
  ];
  if (d.phone) info.push({ label: "Phone", value: d.phone });
  const message = d.message.slice(0, 5000);
  const bodyHtml = `<p style="margin:0 0 8px;color:#555;font-size:14px">A visitor sent this through your store's contact form. Reply to this email to answer them directly.</p><div style="margin:0 0 16px;padding:12px 14px;background:#fafafa;border-radius:6px;white-space:pre-wrap">${escapeHtml(message).replace(/\n/g, "<br>")}</div>`;
  const layout = { brand: d.brand, heading: "New message from your store", preheader: message.slice(0, 90), info };
  return { subject, html: renderLayout({ ...layout, bodyHtml }), text: renderLayoutText({ ...layout, bodyText: `A visitor sent this through your store's contact form. Reply to this email to answer them.\n\n${message}` }) };
}
