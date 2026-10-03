"use server";

import { refresh } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { activeWhatsApp } from "@/features/inbox/server/whatsapp";
import { listApprovedTemplates } from "./cloud-api";
import { normalizeWhatsAppPhone } from "./phone";
import { enqueueJob, processJob } from "./queue";
import { SAMPLE_VALUES, WHATSAPP_EVENTS, renderPreview, resolveParams, templateFitsEvent, type ParamFormat } from "./templates";

/** Settings → Notifications (WhatsApp). Tenant from membership; settings.write required. */
async function ctx() {
  const c = await requireTenant();
  assertPermission(c, "settings.write");
  return c;
}

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const eventSchema = z.object({
  event: z.enum(WHATSAPP_EVENTS),
  enabled: bool.default(false),
  // "<name>|<language>" picked from the approved list, or "" for none.
  template: z.union([z.literal(""), z.string().regex(/^[a-z0-9_]{1,512}\|[A-Za-z]{2,3}(_[A-Za-z0-9]{2,8})?$/, "Pick a template from the list")]).default(""),
});

export async function saveWhatsAppEventAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("notifications.whatsapp_event", async () => {
    const c = await ctx();
    const v = parseInput(eventSchema, formToObject(fd));
    const supabase = await createSupabaseServerClient();
    if (!v.template) {
      if (v.enabled) throw new AppError("VALIDATION", { fieldErrors: { template: ["Pick an approved template before turning this on"] } });
      const { error } = await supabase.from("whatsapp_notification_settings").upsert({ tenant_id: c.tenantId, event: v.event, enabled: false, template_name: null, language_code: null, body_text: null, param_names: [], updated_by: c.user.id }, { onConflict: "tenant_id,event" });
      if (error) throw mapDbError(error);
      return;
    }
    const [name, language] = v.template.split("|") as [string, string];
    // Re-read the template from Meta: the body and placeholders are never taken from the browser.
    const wa = await activeWhatsApp(c.tenantId);
    if (!wa) throw new AppError("CONFLICT", { message: "WhatsApp isn't connected. Connect it in Marketing → Inbox first." });
    const list = await listApprovedTemplates(wa.wabaId, wa.token);
    if (!list.ok) throw new AppError("VALIDATION", { message: `Couldn't load your templates: ${list.message}` });
    const tpl = list.templates.find((t) => t.name === name && t.language === language);
    if (!tpl) throw new AppError("VALIDATION", { fieldErrors: { template: ["That template isn't approved (or no longer exists) on your WhatsApp account"] } });
    const misfit = templateFitsEvent(v.event, tpl);
    if (misfit) throw new AppError("VALIDATION", { fieldErrors: { template: [misfit] } });
    const { error } = await supabase.from("whatsapp_notification_settings").upsert(
      { tenant_id: c.tenantId, event: v.event, enabled: v.enabled, template_name: tpl.name, language_code: tpl.language, body_text: tpl.bodyText.slice(0, 1100), param_format: tpl.paramFormat, param_names: tpl.paramNames, updated_by: c.user.id },
      { onConflict: "tenant_id,event" },
    );
    if (error) throw mapDbError(error);
    await audit({ tenantId: c.tenantId, actorUserId: c.user.id, action: "settings.whatsapp_notification_saved", entityType: "settings", entityId: v.event, metadata: { enabled: v.enabled, template: tpl.name, language: tpl.language } });
  });
  if (result.ok) refresh();
  return result;
}

const testSchema = z.object({ event: z.enum(WHATSAPP_EVENTS), phone: z.string().trim().min(8, "Enter your WhatsApp number").max(20) });

/**
 * Sends the mapped template with sample values to a number the seller types (their own). The
 * result reported is what Meta returned: "accepted" with a message id, or the error.
 */
export async function testWhatsAppSendAction(_prev: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const result = await runAction("notifications.whatsapp_test", async () => {
    const c = await ctx();
    const v = parseInput(testSchema, formToObject(fd));
    const to = normalizeWhatsAppPhone(v.phone);
    if (!to) throw new AppError("VALIDATION", { fieldErrors: { phone: ["Enter a valid mobile number (Indian 10-digit, or +country code)"] } });
    await rateLimit("whatsapp-test-send", c.tenantId, 10, 3600);
    const supabase = await createSupabaseServerClient();
    const [{ data: s }, { data: store }] = await Promise.all([
      supabase.from("whatsapp_notification_settings").select("template_name, language_code, body_text, param_format, param_names").eq("tenant_id", c.tenantId).eq("event", v.event).maybeSingle(),
      supabase.from("stores").select("name").eq("tenant_id", c.tenantId).maybeSingle(),
    ]);
    if (!s?.template_name || !s.language_code) throw new AppError("VALIDATION", { message: "Map an approved template to this event first." });
    if (!(await activeWhatsApp(c.tenantId))) throw new AppError("CONFLICT", { message: "WhatsApp isn't connected." });
    const format = s.param_format as ParamFormat;
    const params = resolveParams(v.event, format, s.param_names, { ...SAMPLE_VALUES, store_name: store?.name ?? SAMPLE_VALUES.store_name });
    const jobId = await enqueueJob({ tenantId: c.tenantId, event: "test", idempotencyKey: `test:${randomUUID()}`, recipient: to, templateName: s.template_name, languageCode: s.language_code, params, preview: renderPreview(s.body_text, format, params, s.template_name), maxAttempts: 1 });
    const status = jobId ? await processJob(jobId) : null;
    await audit({ tenantId: c.tenantId, actorUserId: c.user.id, action: "settings.whatsapp_test_sent", entityType: "settings", entityId: v.event, metadata: { status } });
    if (status !== "sent") {
      const { data: job } = jobId ? await supabase.from("notification_jobs").select("last_error").eq("tenant_id", c.tenantId).eq("id", jobId).maybeSingle() : { data: null };
      throw new AppError("VALIDATION", { message: `Not sent: ${job?.last_error ?? "the message couldn't be queued"}` });
    }
    return "WhatsApp accepted the message. Delivery status appears in Recent messages below once WhatsApp reports it.";
  });
  refresh();
  return result;
}
