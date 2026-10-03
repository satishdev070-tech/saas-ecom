import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({ serverEnv: () => ({ META_GRAPH_VERSION: "v25.0" }) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { normalizeWhatsAppPhone, waIdFromE164 } from "@/features/notifications/whatsapp/phone";
import {
  EVENT_VARIABLES,
  RECOMMENDED_TEMPLATES,
  WHATSAPP_EVENTS,
  buildTemplatePayload,
  cleanParam,
  parseTemplateNode,
  placeholders,
  renderPreview,
  resolveParams,
  templateFitsEvent,
} from "@/features/notifications/whatsapp/templates";
import { backoffMs, gate, isRetryable, nextState, shouldApplyStatus, whatsappEventFor } from "@/features/notifications/whatsapp/policy";
import { listApprovedTemplates, sendTemplateMessage } from "@/features/notifications/whatsapp/cloud-api";
import { parseNotificationWebhook } from "@/features/notifications/whatsapp/webhook-parse";

describe("phone normalisation", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["(+91) 98765 43210", "+919876543210"],
    ["00919876543210", "+919876543210"],
    ["+14155550123", "+14155550123"],
    ["0014155550123", "+14155550123"],
  ])("%s -> %s", (raw, e164) => expect(normalizeWhatsAppPhone(raw)).toBe(e164));

  it.each(["", "   ", "12345", "5876543210", "abc", "+0123456789", "14155550123", null, undefined])("rejects %s", (raw) => expect(normalizeWhatsAppPhone(raw)).toBeNull());

  it("wa_id drops the plus", () => expect(waIdFromE164("+919876543210")).toBe("919876543210"));
});

describe("template catalogue", () => {
  it("covers every event, in en and hi, with variables the event provides", () => {
    for (const e of WHATSAPP_EVENTS) {
      const t = RECOMMENDED_TEMPLATES.find((x) => x.event === e)!;
      expect(t, e).toBeTruthy();
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      for (const body of [t.bodies.en, t.bodies.hi]) {
        const names = placeholders(body);
        expect(names).toEqual(EVENT_VARIABLES[e].map((_, i) => String(i + 1)));
        expect(templateFitsEvent(e, { paramFormat: "positional", paramNames: names, unsupported: null })).toBeNull();
      }
    }
    expect(RECOMMENDED_TEMPLATES.find((t) => t.event === "abandoned_cart")!.category).toBe("MARKETING");
    expect(RECOMMENDED_TEMPLATES.filter((t) => t.event !== "abandoned_cart").every((t) => t.category === "UTILITY")).toBe(true);
  });
});

describe("template payloads", () => {
  it("builds a positional template message in the documented shape", () => {
    const params = resolveParams("order_placed", "positional", ["1", "2", "3", "4"], { customer_name: "Asha", store_name: "Ramya", order_number: "#1001", order_total: "₹1,499.00" });
    expect(buildTemplatePayload({ to: "+919876543210", templateName: "order_confirmation", languageCode: "en", params })).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+919876543210",
      type: "template",
      template: {
        name: "order_confirmation",
        language: { code: "en" },
        components: [{ type: "body", parameters: ["Asha", "Ramya", "#1001", "₹1,499.00"].map((text) => ({ type: "text", text })) }],
      },
    });
  });

  it("sends named parameters with parameter_name and omits components when there are none", () => {
    const params = resolveParams("order_shipped", "named", ["tracking_url", "customer_name"], { customer_name: "Asha", tracking_url: "https://t.example/1" });
    const p = buildTemplatePayload({ to: "+919876543210", templateName: "shipped", languageCode: "hi", params });
    expect(p.template.components![0]!.parameters).toEqual([
      { type: "text", text: "https://t.example/1", parameter_name: "tracking_url" },
      { type: "text", text: "Asha", parameter_name: "customer_name" },
    ]);
    expect(buildTemplatePayload({ to: "+1", templateName: "x", languageCode: "en", params: [] }).template.components).toBeUndefined();
  });

  it("cleans parameter text (no newlines/tabs/long runs of spaces, never empty)", () => {
    expect(cleanParam("a\n\tb     c")).toBe("a b c");
    expect(cleanParam("  ")).toBe("-");
    expect(cleanParam(null)).toBe("-");
    expect(cleanParam("x".repeat(400)).length).toBe(300);
  });

  it("only uses as many positional params as the template has", () => {
    expect(resolveParams("order_placed", "positional", ["1", "2"], { customer_name: "A", store_name: "S", order_number: "#1" }).map((p) => p.text)).toEqual(["A", "S"]);
  });

  it("renders a preview for the inbox", () => {
    expect(renderPreview("Hi {{1}}, order {{2}}", "positional", [{ text: "Asha" }, { text: "#7" }], "t")).toBe("Hi Asha, order #7");
    expect(renderPreview(null, "positional", [{ text: "Asha" }], "t")).toContain("[WhatsApp template: t]");
  });

  it("parses WABA templates and flags ones we can't fill", () => {
    const ok = parseTemplateNode({ name: "order_shipped", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}} {{2}}" }, { type: "FOOTER", text: "x" }] })!;
    expect(ok).toMatchObject({ paramFormat: "positional", paramNames: ["1", "2"], unsupported: null });
    const named = parseTemplateNode({ name: "n", language: "en", status: "APPROVED", parameter_format: "NAMED", components: [{ type: "BODY", text: "Hi {{customer_name}} {{bogus}}" }] })!;
    expect(named.paramFormat).toBe("named");
    expect(templateFitsEvent("order_placed", named)).toMatch(/bogus/);
    expect(parseTemplateNode({ name: "m", language: "en", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "x" }] })!.unsupported).toMatch(/image/);
    expect(parseTemplateNode({ name: "b", language: "en", components: [{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x/{{1}}" }] }] })!.unsupported).toMatch(/dynamic URL/);
    expect(templateFitsEvent("out_for_delivery", { paramFormat: "positional", paramNames: ["1", "4"], unsupported: null })).toMatch(/\{\{4\}\}/);
    expect(parseTemplateNode({ language: "en" })).toBeNull();
  });
});

describe("gating", () => {
  const base = { connected: true, setting: { enabled: true, templateName: "order_confirmation", languageCode: "en" }, phone: "+919876543210", optedIn: true };
  it("sends only when connected, enabled, mapped, valid phone and opted in", () => {
    expect(gate(base)).toEqual({ send: true, templateName: "order_confirmation", languageCode: "en", to: "+919876543210" });
    expect(gate({ ...base, connected: false })).toMatchObject({ send: false, reason: "whatsapp not connected" });
    expect(gate({ ...base, setting: null })).toMatchObject({ send: false, reason: "event disabled" });
    expect(gate({ ...base, setting: { ...base.setting, enabled: false } })).toMatchObject({ send: false });
    expect(gate({ ...base, setting: { ...base.setting, templateName: null } })).toMatchObject({ send: false, reason: "no template mapped" });
    expect(gate({ ...base, phone: null })).toMatchObject({ send: false, reason: "no valid phone" });
    expect(gate({ ...base, optedIn: false })).toMatchObject({ send: false, reason: "customer not opted in" });
  });

  it("maps dispatcher events", () => {
    expect(whatsappEventFor({ type: "order.placed", tenantId: "t", orderId: "o", payment: "cod" })).toBe("order_placed");
    expect(whatsappEventFor({ type: "shipment.updated", tenantId: "t", orderId: "o", status: "shipped" })).toBe("order_shipped");
    expect(whatsappEventFor({ type: "shipment.updated", tenantId: "t", orderId: "o", status: "out_for_delivery" })).toBe("out_for_delivery");
    expect(whatsappEventFor({ type: "shipment.updated", tenantId: "t", orderId: "o", status: "delivered" })).toBe("order_delivered");
    expect(whatsappEventFor({ type: "cart.abandoned", tenantId: "t", cartId: "c" })).toBe("abandoned_cart");
    expect(whatsappEventFor({ type: "order.status_changed", tenantId: "t", orderId: "o", status: "paid" })).toBeNull();
  });
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const payload = buildTemplatePayload({ to: "+919876543210", templateName: "order_confirmation", languageCode: "en", params: [{ text: "Asha" }] });

describe("queue retry logic (mocked fetch)", () => {
  it("success records the message id; token only in the Authorization header", async () => {
    const fetchImpl = vi.fn(async () => json(200, { messaging_product: "whatsapp", contacts: [{ input: "+919876543210", wa_id: "919876543210" }], messages: [{ id: "wamid.OK" }] }));
    const r = await sendTemplateMessage("PNID", "SECRET", payload, fetchImpl);
    expect(r).toEqual({ ok: true, messageId: "wamid.OK" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/PNID/messages");
    expect(url).not.toContain("SECRET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET");
    expect(JSON.parse(String(init.body))).toEqual(payload);
    expect(nextState(r, 1, 5)).toEqual({ status: "sent", providerMessageId: "wamid.OK" });
  });

  it("network errors, 5xx and throttling retry with growing backoff until max attempts", async () => {
    const now = new Date("2026-10-03T00:00:00Z");
    const net = await sendTemplateMessage("PNID", "T", payload, vi.fn(async () => Promise.reject(new Error("ECONNRESET"))));
    expect(net).toMatchObject({ ok: false, httpStatus: 0 });
    expect(nextState(net, 1, 5, now)).toMatchObject({ status: "queued", nextAttemptAt: new Date(now.getTime() + 60_000) });
    const throttled = await sendTemplateMessage("PNID", "T", payload, vi.fn(async () => json(400, { error: { code: 130429, message: "rate" } })));
    expect(throttled).toMatchObject({ ok: false, code: 130429 });
    expect(nextState(throttled, 2, 5, now)).toMatchObject({ status: "queued", nextAttemptAt: new Date(now.getTime() + 5 * 60_000) });
    const server = await sendTemplateMessage("PNID", "T", payload, vi.fn(async () => json(503, {})));
    expect(nextState(server, 5, 5, now)).toMatchObject({ status: "failed" });
    expect(backoffMs(1) < backoffMs(2) && backoffMs(2) < backoffMs(3) && backoffMs(4) < backoffMs(5)).toBe(true);
    expect(backoffMs(99)).toBe(backoffMs(5));
  });

  it("permanent errors fail at once with our wording (no token leak)", async () => {
    const missing = await sendTemplateMessage("PNID", "T", payload, vi.fn(async () => json(404, { error: { code: 132001, message: "Template name does not exist in the translation" } })));
    expect(missing).toMatchObject({ ok: false, code: 132001 });
    expect(nextState(missing, 1, 5)).toMatchObject({ status: "failed", lastError: expect.stringMatching(/template/i) });
    const revoked = await sendTemplateMessage("PNID", "T", payload, vi.fn(async () => json(401, { error: { code: 190 } })));
    expect(nextState(revoked, 1, 5)).toMatchObject({ status: "failed", lastError: expect.stringMatching(/expired or was revoked/) });
    expect(isRetryable(400, 131026)).toBe(false);
    expect(isRetryable(400, 131049)).toBe(false);
  });

  it("lists only APPROVED templates and follows paging", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: [{ name: "b_t", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "Hi {{1}}" }] }, { name: "p", language: "en", status: "PENDING", components: [] }], paging: { next: "https://graph.facebook.com/v25.0/WABA/message_templates?after=x" } }))
      .mockResolvedValueOnce(json(200, { data: [{ name: "a_t", language: "hi", status: "APPROVED", components: [{ type: "BODY", text: "नमस्ते {{1}}" }] }], paging: {} }));
    const r = await listApprovedTemplates("WABA", "T", fetchImpl);
    expect(r.ok && r.templates.map((t) => `${t.name}|${t.language}`)).toEqual(["a_t|hi", "b_t|en"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await listApprovedTemplates("", "T", fetchImpl)).toMatchObject({ ok: false });
  });
});

describe("status webhook", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "PNID" },
              statuses: [
                { id: "wamid.1", status: "delivered", timestamp: "1700000000" },
                { id: "wamid.2", status: "failed", timestamp: "1700000000", errors: [{ code: 131026, title: "Undeliverable" }] },
                { id: "wamid.3", status: "played" },
              ],
              messages: [
                { from: "919876543210", id: "m1", type: "text", text: { body: " STOP " } },
                { from: "919876543211", id: "m2", type: "text", text: { body: "start" } },
                { from: "919876543212", id: "m3", type: "text", text: { body: "please stop by" } },
              ],
            },
          },
        ],
      },
    ],
  };
  it("parses statuses and STOP/START keywords", () => {
    const r = parseNotificationWebhook(body);
    expect(r.statuses.map((s) => [s.messageId, s.status])).toEqual([
      ["wamid.1", "delivered"],
      ["wamid.2", "failed"],
    ]);
    expect(r.statuses[1]!.error).toBe("Undeliverable (code 131026)");
    expect(r.keywords).toEqual([
      { accountId: "PNID", from: "919876543210", optIn: false },
      { accountId: "PNID", from: "919876543211", optIn: true },
    ]);
    expect(parseNotificationWebhook({ object: "page" })).toEqual({ statuses: [], keywords: [] });
  });

  it("status updates only move forward", () => {
    expect(shouldApplyStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyStatus("read", "delivered")).toBe(false);
    expect(shouldApplyStatus("delivered", "read")).toBe(true);
    expect(shouldApplyStatus("sent", "failed")).toBe(true);
    expect(shouldApplyStatus("delivered", "failed")).toBe(false);
    expect(shouldApplyStatus("failed", "read")).toBe(false);
  });
});
