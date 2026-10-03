import type { Metadata } from "next";
import Link from "next/link";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { listNotificationTemplates } from "@/features/settings/queries";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_META } from "@/features/settings/notification-templates";
import { TemplateForm } from "@/features/dashboard-ui/forms";
import { getEmailPreferences } from "@/features/notifications/email/queries";
import { emailProviderConfigured } from "@/features/notifications/email/status";
import { EmailPreferencesForm } from "@/features/notifications/email/components/email-preferences-form";
import { activeWhatsApp, whatsappSummary } from "@/features/inbox/server/whatsapp";
import { listApprovedTemplates } from "@/features/notifications/whatsapp/cloud-api";
import { EVENT_META, EVENT_VARIABLES, RECOMMENDED_TEMPLATES, WHATSAPP_EVENTS, templateFitsEvent, type ApprovedTemplate } from "@/features/notifications/whatsapp/templates";
import { WhatsAppEventForm, WhatsAppTestSendForm, type TemplateOption } from "@/features/notifications/whatsapp/components/settings-forms";

export const metadata: Metadata = { title: "Notifications" };

const INBOX_SETUP = "/dashboard/marketing/inbox";
const JOB_TONE: Record<string, "success" | "warning" | "neutral" | "error"> = { sent: "neutral", delivered: "success", read: "success", failed: "error", queued: "warning", sending: "warning", cancelled: "neutral" };
const JOB_LABEL: Record<string, string> = { queued: "Queued (retrying)", sending: "Sending", sent: "Accepted by WhatsApp", delivered: "Delivered", read: "Read", failed: "Failed", cancelled: "Cancelled" };

async function loadTemplates(tenantId: string): Promise<{ templates: ApprovedTemplate[]; error: string | null }> {
  const wa = await activeWhatsApp(tenantId);
  if (!wa) return { templates: [], error: null };
  const r = await listApprovedTemplates(wa.wabaId, wa.token);
  return r.ok ? { templates: r.templates, error: null } : { templates: [], error: r.message };
}

export default async function NotificationsPage() {
  const ctx = await requireTenantPermission("settings.write");
  const supabase = await createSupabaseServerClient();
  const [saved, emailPrefs, wa, { templates, error: templateError }, settings, jobs] = await Promise.all([
    listNotificationTemplates(ctx.tenantId),
    getEmailPreferences(ctx.tenantId),
    whatsappSummary(ctx.tenantId),
    loadTemplates(ctx.tenantId),
    supabase.from("whatsapp_notification_settings").select("event, enabled, template_name, language_code").eq("tenant_id", ctx.tenantId),
    supabase.from("notification_jobs").select("id, event, recipient, template_name, status, attempts, last_error, created_at").eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(20),
  ]);
  const connected = wa.status === "connected" && wa.enabled;
  const mapped = (settings.data ?? []).filter((s) => s.template_name);

  return (
    <div className="space-y-6">
      <PageHeader title="Customer notifications" description="Order updates sent to shoppers by WhatsApp and email." />

      <Card
        title="WhatsApp"
        description="Automatic WhatsApp Business messages, sent from your connected number with templates WhatsApp has approved. Only shoppers who ticked the WhatsApp box at checkout receive them; they can reply STOP at any time."
        actions={connected ? <Badge tone="success">Connected{wa.displayPhone ? ` · ${wa.displayPhone}` : ""}</Badge> : <Badge tone="warning">{wa.status === "expired" ? "Connection expired" : "WhatsApp not connected"}</Badge>}
      >
        {!connected ? (
          <p className="text-small">
            {wa.status === "expired" ? "Your WhatsApp access token expired or was revoked. " : "Connect your WhatsApp Business number first. "}
            <Link href={INBOX_SETUP} className="font-medium text-accent hover:underline">
              Set up WhatsApp in Marketing → Inbox
            </Link>
          </p>
        ) : templateError ? (
          <p role="alert" className="text-small text-error">
            Couldn&apos;t load your approved templates: {templateError}
          </p>
        ) : templates.length === 0 ? (
          <p className="text-small text-muted">No approved templates yet. Submit the recommended templates below in WhatsApp Manager; approval usually takes minutes to a day.</p>
        ) : (
          <p className="text-small text-muted">{templates.length} approved template{templates.length > 1 ? "s" : ""} found on your WhatsApp account.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {WHATSAPP_EVENTS.map((event) => {
          const s = (settings.data ?? []).find((x) => x.event === event);
          const options: TemplateOption[] = templates.map((t) => ({ value: `${t.name}|${t.language}`, label: `${t.name} · ${t.language}${t.category ? ` · ${t.category.toLowerCase()}` : ""}`, disabledReason: templateFitsEvent(event, t) }));
          return (
            <Card key={event} title={EVENT_META[event].label} description={EVENT_META[event].description}>
              <WhatsAppEventForm event={event} enabled={s?.enabled ?? false} current={s?.template_name && s.language_code ? `${s.template_name}|${s.language_code}` : ""} options={options} connected={connected} />
              <p className="mt-3 text-caption text-muted">
                Variables: {EVENT_VARIABLES[event].map((v, i) => `{{${i + 1}}} ${v}`).join(", ")}
              </p>
            </Card>
          );
        })}
      </div>

      {connected ? (
        <Card title="Send a test" description="Sends the mapped template to your own number with sample values. The result shown is exactly what WhatsApp returned.">
          <WhatsAppTestSendForm events={mapped.map((s) => ({ value: s.event, label: EVENT_META[s.event as (typeof WHATSAPP_EVENTS)[number]]?.label ?? s.event }))} />
          {!mapped.length ? <p className="mt-2 text-caption text-muted">Map a template to an event first.</p> : null}
        </Card>
      ) : null}

      <Card title="Recent WhatsApp messages" description="Last 20 notifications. Delivered and read come from WhatsApp's status webhook.">
        {jobs.data?.length ? (
          <Table caption="Recent WhatsApp notifications">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Event</th>
                <th className={th}>To</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id}>
                  <td className={td}>{new Date(j.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td>
                  <td className={td}>{j.event === "test" ? "Test" : (EVENT_META[j.event as (typeof WHATSAPP_EVENTS)[number]]?.label ?? j.event)}</td>
                  <td className={td}>{`${j.recipient.slice(0, -4).replace(/\d/g, "•")}${j.recipient.slice(-4)}`}</td>
                  <td className={td}>
                    <Badge tone={JOB_TONE[j.status] ?? "neutral"}>{JOB_LABEL[j.status] ?? j.status}</Badge>
                    {j.last_error && j.status !== "delivered" && j.status !== "read" && j.status !== "sent" ? <p className="mt-1 text-caption text-muted">{j.last_error}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-small text-muted">No WhatsApp notifications yet.</p>
        )}
      </Card>

      <Card title="Templates to submit in WhatsApp Manager" description="Create each one in English (en) and Hindi (hi), with the same variables in the same order. Utility templates are for order updates; the cart reminder is marketing.">
        <div className="space-y-4">
          {RECOMMENDED_TEMPLATES.map((t) => (
            <div key={t.name} className="rounded-md border border-border p-3">
              <p className="text-small font-semibold">
                <code>{t.name}</code> <Badge tone="neutral">{t.category}</Badge> <span className="text-caption text-muted">for {EVENT_META[t.event].label}</span>
              </p>
              <p className="mt-2 text-small">
                <span className="text-muted">en: </span>
                {t.bodies.en}
              </p>
              <p className="mt-1 text-small" lang="hi">
                <span className="text-muted">hi: </span>
                {t.bodies.hi}
              </p>
              <p className="mt-1 text-caption text-muted">Footer: {t.footer.en} / {t.footer.hi}</p>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="pt-2 text-h3 font-semibold">Email</h2>
      <p className="text-small text-muted">Emails sent to shoppers. Edit the wording; {"{{placeholders}}"} are filled in automatically.</p>
      <Card title="Which emails to send">
        <EmailPreferencesForm prefs={emailPrefs} providerConfigured={emailProviderConfigured()} />
      </Card>
      {TEMPLATE_KEYS.map((k) => {
        const s = saved.find((t) => t.key === k && t.channel === "email");
        const d = DEFAULT_TEMPLATES[k];
        return (
          <Card key={k} title={TEMPLATE_META[k].label} description={TEMPLATE_META[k].description}>
            <TemplateForm tkey={k} subject={s?.subject ?? d.subject} body={s?.body ?? d.body} active={s?.active ?? true} custom={Boolean(s)} variables={TEMPLATE_META[k].placeholders} />
          </Card>
        );
      })}
    </div>
  );
}
