/**
 * WhatsApp notification events, recommended templates and payload building (pure; unit tested).
 *
 * Meta rules (WhatsApp Cloud API docs, "Template fundamentals" / "Components"):
 * - Business-initiated messages outside the 24-hour customer-service window must be pre-approved
 *   templates: POST /{phone-number-id}/messages with
 *   { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
 *     template: { name, language: { code }, components: [{ type: "body", parameters: [{ type: "text", text }] }] } }
 * - Parameters are positional ({{1}}, {{2}} ...) or named ({{first_name}}, sent with parameter_name).
 * - Only message people who opted in to messages from this business, and honour opt-outs.
 *
 * Sellers create these templates in WhatsApp Manager, then map each event to an APPROVED
 * template in Settings -> Notifications. Positional templates receive the event's variables in
 * the order listed in EVENT_VARIABLES; named templates may use any of the variable names.
 */

export const WHATSAPP_EVENTS = ["order_placed", "order_shipped", "out_for_delivery", "order_delivered", "abandoned_cart"] as const;
export type WhatsAppEvent = (typeof WHATSAPP_EVENTS)[number];

export const VARIABLES = ["customer_name", "store_name", "order_number", "order_total", "carrier", "tracking_number", "tracking_url", "cart_url"] as const;
export type TemplateVariable = (typeof VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

/** Variables each event provides, in positional order ({{1}} = first). */
export const EVENT_VARIABLES: Record<WhatsAppEvent, readonly TemplateVariable[]> = {
  order_placed: ["customer_name", "store_name", "order_number", "order_total"],
  order_shipped: ["customer_name", "order_number", "carrier", "tracking_number", "tracking_url"],
  out_for_delivery: ["customer_name", "order_number", "store_name"],
  order_delivered: ["customer_name", "order_number", "store_name"],
  abandoned_cart: ["customer_name", "store_name", "cart_url"],
};

export const EVENT_META: Record<WhatsAppEvent, { label: string; description: string }> = {
  order_placed: { label: "Order placed", description: "Right after checkout (COD) or once an online payment is confirmed." },
  order_shipped: { label: "Order shipped", description: "When the order is marked shipped, with the courier and tracking link." },
  out_for_delivery: { label: "Out for delivery", description: "When the courier reports the parcel is out for delivery." },
  order_delivered: { label: "Delivered", description: "When the order is marked delivered." },
  abandoned_cart: { label: "Abandoned cart reminder", description: "One reminder for a signed-in shopper's cart left without checkout (marketing template)." },
};

export type RecommendedTemplate = {
  event: WhatsAppEvent;
  name: string;
  category: "UTILITY" | "MARKETING";
  bodies: { en: string; hi: string };
  footer: { en: string; hi: string };
};

const FOOTER = { en: "Reply STOP to stop these messages", hi: "ये संदेश बंद करने के लिए STOP लिखें" };

/** Templates to submit in WhatsApp Manager (one per language: "en" and "hi"). */
export const RECOMMENDED_TEMPLATES: readonly RecommendedTemplate[] = [
  {
    event: "order_placed",
    name: "order_confirmation",
    category: "UTILITY",
    bodies: {
      en: "Hi {{1}}, thank you for shopping with {{2}}! Your order {{3}} for {{4}} has been received. We'll message you here when it ships.",
      hi: "नमस्ते {{1}}, {{2}} से खरीदारी करने के लिए धन्यवाद! आपका ऑर्डर {{3}} ({{4}}) हमें मिल गया है। ऑर्डर भेजे जाने पर हम आपको यहीं बताएंगे।",
    },
    footer: FOOTER,
  },
  {
    event: "order_shipped",
    name: "order_shipped",
    category: "UTILITY",
    bodies: {
      en: "Hi {{1}}, your order {{2}} has shipped with {{3}}. Tracking number: {{4}}. Track it here: {{5}}",
      hi: "नमस्ते {{1}}, आपका ऑर्डर {{2}} {{3}} से भेज दिया गया है। ट्रैकिंग नंबर: {{4}}। यहाँ ट्रैक करें: {{5}}",
    },
    footer: FOOTER,
  },
  {
    event: "out_for_delivery",
    name: "order_out_for_delivery",
    category: "UTILITY",
    bodies: {
      en: "Hi {{1}}, your order {{2}} from {{3}} is out for delivery today. Please keep your phone handy.",
      hi: "नमस्ते {{1}}, आपका ऑर्डर {{2}} ({{3}}) आज डिलीवरी के लिए निकल चुका है। कृपया अपना फ़ोन पास रखें।",
    },
    footer: FOOTER,
  },
  {
    event: "order_delivered",
    name: "order_delivered",
    category: "UTILITY",
    bodies: {
      en: "Hi {{1}}, your order {{2}} has been delivered. Thank you for shopping with {{3}}! Reply to this message if you need any help.",
      hi: "नमस्ते {{1}}, आपका ऑर्डर {{2}} डिलीवर हो गया है। {{3}} से खरीदारी करने के लिए धन्यवाद! किसी भी मदद के लिए इस संदेश का जवाब दें।",
    },
    footer: FOOTER,
  },
  {
    event: "abandoned_cart",
    name: "cart_reminder",
    category: "MARKETING",
    bodies: {
      en: "Hi {{1}}, you left a few items in your cart at {{2}}. They're still waiting for you: {{3}}",
      hi: "नमस्ते {{1}}, {{2}} पर आपके कार्ट में कुछ सामान रह गया है। वे अभी भी आपका इंतज़ार कर रहे हैं: {{3}}",
    },
    footer: FOOTER,
  },
];

// ------------------------------------------------------------------ approved templates (WABA)

export type ParamFormat = "positional" | "named";

export type ApprovedTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  paramFormat: ParamFormat;
  /** Placeholders in order of appearance: ["1","2"] or ["customer_name", ...]. */
  paramNames: string[];
  /** Null when we can send it; otherwise why not (media header, dynamic URL button, ...). */
  unsupported: string | null;
};

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Unique placeholders in order of first appearance. */
export function placeholders(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!seen.includes(m[1]!)) seen.push(m[1]!);
  return seen;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Parses one node of GET /{waba-id}/message_templates. */
export function parseTemplateNode(node: unknown): ApprovedTemplate | null {
  const n = obj(node);
  if (!n || !str(n.name) || !str(n.language)) return null;
  const components = Array.isArray(n.components) ? n.components.map(obj).filter((c): c is Obj => c !== null) : [];
  const body = components.find((c) => str(c.type).toUpperCase() === "BODY");
  const header = components.find((c) => str(c.type).toUpperCase() === "HEADER");
  const buttons = components.find((c) => str(c.type).toUpperCase() === "BUTTONS");
  const bodyText = str(body?.text);
  const names = placeholders(bodyText);
  const paramFormat: ParamFormat = str(n.parameter_format).toUpperCase() === "NAMED" || names.some((x) => !/^\d+$/.test(x)) ? "named" : "positional";
  let unsupported: string | null = null;
  if (!bodyText) unsupported = "Template has no body text.";
  else if (header && str(header.format).toUpperCase() !== "TEXT" && str(header.format)) unsupported = "Templates with an image, video or document header aren't supported.";
  else if (header && placeholders(str(header.text)).length) unsupported = "Header variables aren't supported; use a fixed header.";
  else if (buttons && (Array.isArray(buttons.buttons) ? buttons.buttons : []).some((b) => placeholders(str(obj(b)?.url)).length)) unsupported = "Buttons with a dynamic URL aren't supported; use a fixed URL.";
  else if (bodyText.length > 1100) unsupported = "Body text is too long.";
  return { name: str(n.name), language: str(n.language), category: str(n.category).toUpperCase(), status: str(n.status).toUpperCase(), bodyText, paramFormat, paramNames: names, unsupported };
}

/** Why this template can't carry this event's variables, or null when it fits. */
export function templateFitsEvent(event: WhatsAppEvent, t: Pick<ApprovedTemplate, "paramFormat" | "paramNames" | "unsupported">): string | null {
  if (t.unsupported) return t.unsupported;
  const vars = EVENT_VARIABLES[event];
  if (t.paramFormat === "positional") {
    const max = Math.max(0, ...t.paramNames.map(Number));
    return max > vars.length ? `This event provides ${vars.length} variable${vars.length === 1 ? "" : "s"} ({{1}}–{{${vars.length}}}), but the template uses {{${max}}}.` : null;
  }
  const unknown = t.paramNames.filter((x) => !(vars as readonly string[]).includes(x));
  return unknown.length ? `Unknown variable${unknown.length > 1 ? "s" : ""} for this event: ${unknown.join(", ")}. Available: ${vars.join(", ")}.` : null;
}

// ------------------------------------------------------------------ payloads

export type JobParam = { text: string; name?: string };

/**
 * Meta rejects parameter text with newlines, tabs or more than four consecutive spaces, and empty
 * strings; collapse whitespace and fall back to "-".
 */
export function cleanParam(v: string | null | undefined, max = 300): string {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "-";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Resolves the template's placeholders to job parameters, in the order Meta expects. */
export function resolveParams(event: WhatsAppEvent, format: ParamFormat, paramNames: readonly string[], values: TemplateValues): JobParam[] {
  const vars = EVENT_VARIABLES[event];
  if (format === "named") return paramNames.map((name) => ({ name, text: cleanParam(values[name as TemplateVariable]) }));
  const count = Math.max(0, ...paramNames.map(Number));
  return Array.from({ length: count }, (_, i) => ({ text: cleanParam(values[vars[i]!]) }));
}

export type TemplateMessage = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: { name: string; language: { code: string }; components?: { type: "body"; parameters: { type: "text"; text: string; parameter_name?: string }[] }[] };
};

export function buildTemplatePayload(input: { to: string; templateName: string; languageCode: string; params: readonly JobParam[] }): TemplateMessage {
  const parameters = input.params.map((p) => ({ type: "text" as const, text: p.text, ...(p.name ? { parameter_name: p.name } : {}) }));
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    template: { name: input.templateName, language: { code: input.languageCode }, ...(parameters.length ? { components: [{ type: "body" as const, parameters }] } : {}) },
  };
}

/** Body text with parameters filled in (inbox copy / dashboard preview). */
export function renderPreview(bodyText: string | null | undefined, format: ParamFormat, params: readonly JobParam[], templateName: string): string {
  if (!bodyText) return `[WhatsApp template: ${templateName}] ${params.map((p) => p.text).join(" · ")}`.slice(0, 1100);
  const byName = new Map(params.map((p, i) => [format === "named" ? (p.name ?? "") : String(i + 1), p.text]));
  return bodyText.replace(PLACEHOLDER, (all, key: string) => byName.get(key) ?? all).slice(0, 1100);
}

/** Sample values for a test send. */
export const SAMPLE_VALUES: Required<{ [K in TemplateVariable]: string }> = {
  customer_name: "Asha",
  store_name: "Your store",
  order_number: "#1001",
  order_total: "₹1,499.00",
  carrier: "Delhivery",
  tracking_number: "TEST123456",
  tracking_url: "https://example.com/track/TEST123456",
  cart_url: "https://example.com/cart",
};
