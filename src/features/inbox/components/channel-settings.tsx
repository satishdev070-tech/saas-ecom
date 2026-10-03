"use client";

import { TextField } from "@/components/ui/field";
import { Badge } from "@/components/ui/layout";
import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { connectWhatsAppAction, disconnectWhatsAppAction, subscribePageAction } from "../actions";

type Status = "connected" | "error" | "expired" | "not_connected" | "disabled" | string;
const TONE = (s: Status) => (s === "connected" ? "success" : s === "expired" || s === "error" ? "warning" : "neutral");
const LABEL = (s: Status) => (s === "connected" ? "Connected" : s === "expired" ? "Expired" : s === "error" ? "Error" : "Not connected");

export type ChannelSettingsProps = {
  canManage: boolean;
  meta: { facebook: { status: Status; account: string | null }; instagram: { status: Status; account: string | null } };
  whatsapp: { status: Status; statusMessage: string | null; phoneNumberId: string | null; wabaId: string | null; displayPhone: string | null; accountName: string | null; tokenHint: string | null };
};

export function ChannelSettings({ canManage, meta, whatsapp }: ChannelSettingsProps) {
  const fbConnected = meta.facebook.status === "connected";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h3 className="font-semibold">Messenger &amp; Instagram DMs</h3>
          <p className="text-caption text-muted">Uses the Facebook Page connection from Social → Accounts. Instagram messages arrive for the Instagram professional account linked to that Page.</p>
        </div>
        <ul className="space-y-1.5 text-small">
          {(["facebook", "instagram"] as const).map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {k === "facebook" ? "Facebook Page" : "Instagram"}
                {meta[k].account ? <span className="text-muted"> · {meta[k].account}</span> : null}
              </span>
              <Badge tone={TONE(meta[k].status)}>{LABEL(meta[k].status)}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted">
          Messaging needs the <code>pages_messaging</code> and <code>instagram_manage_messages</code> permissions, which Meta grants only after App Review (and Advanced Access) for the platform&apos;s app. Until then, only people with a role on the Meta app can message through it. If you connected before messaging was enabled, reconnect in Social → Accounts to grant it.
        </p>
        {canManage && fbConnected ? <InlineAction action={subscribePageAction} label="Receive messages from this Page" success="Subscribed." /> : null}
        {!fbConnected ? (
          <a href="/dashboard/marketing/social/accounts" className="text-small font-medium text-accent hover:underline">
            Connect Facebook &amp; Instagram
          </a>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">WhatsApp Business</h3>
            <p className="text-caption text-muted">WhatsApp Cloud API with your own WhatsApp Business Account.</p>
          </div>
          <Badge tone={TONE(whatsapp.status)}>{LABEL(whatsapp.status)}</Badge>
        </div>
        {whatsapp.status === "connected" ? (
          <p className="text-small">
            {whatsapp.accountName || "WhatsApp number"}
            {whatsapp.displayPhone ? <span className="text-muted"> · {whatsapp.displayPhone}</span> : null}
          </p>
        ) : null}
        {whatsapp.statusMessage ? <p className="text-caption text-warning">{whatsapp.statusMessage}</p> : null}
        {canManage ? (
          <>
            <ActionForm action={connectWhatsAppAction} submitLabel={whatsapp.status === "connected" ? "Save and re-check" : "Check and connect"} success="Connected." className="space-y-3">
              {(errors) => (
                <>
                  <TextField label="Phone number ID" name="phoneNumberId" inputMode="numeric" autoComplete="off" required defaultValue={whatsapp.phoneNumberId ?? ""} errors={errors.phoneNumberId} hint="Not your phone number: the ID shown next to it." />
                  <TextField label="WhatsApp Business Account ID" name="wabaId" inputMode="numeric" autoComplete="off" required defaultValue={whatsapp.wabaId ?? ""} errors={errors.wabaId} />
                  <TextField
                    label="Permanent access token"
                    name="token"
                    type="password"
                    autoComplete="off"
                    required={!whatsapp.tokenHint}
                    placeholder={whatsapp.tokenHint ? `Saved (…${whatsapp.tokenHint}). Leave blank to keep it.` : "EAA…"}
                    errors={errors.token}
                  />
                </>
              )}
            </ActionForm>
            <details className="text-small">
              <summary className="cursor-pointer font-medium">Where do I find these?</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
                <li>Open Meta Business Manager (business.facebook.com) → WhatsApp Manager and make sure your number is added and verified for the Cloud API.</li>
                <li>
                  <strong>Phone number ID</strong> and <strong>WhatsApp Business Account ID</strong>: in the Meta app dashboard (developers.facebook.com) → your app → WhatsApp → API Setup, both are listed under your number. The account ID is also in Business Settings → Accounts → WhatsApp accounts.
                </li>
                <li>
                  <strong>Permanent access token</strong>: Business Settings → Users → System users → add a system user (Admin), then “Add assets” → your WhatsApp account with full control, and “Generate new token” for the app with the <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code> permissions and no expiry. The temporary token on the API Setup page expires in 24 hours, so don&apos;t use it.
                </li>
                <li>We check the number with WhatsApp before marking it connected and subscribe the app to your account&apos;s message webhooks.</li>
              </ol>
              <p className="mt-2 text-caption text-muted">Free-form replies are allowed for 24 hours after the customer&apos;s last message. After that WhatsApp requires a pre-approved template, which isn&apos;t supported here yet. The token is stored encrypted and never shown again.</p>
            </details>
            {whatsapp.status !== "not_connected" ? (
              <ActionDialog action={disconnectWhatsAppAction} title="Disconnect WhatsApp?" description="New WhatsApp messages will stop arriving here. Existing conversations stay." triggerLabel="Disconnect" triggerVariant="ghost" confirmLabel="Disconnect" variant="danger" />
            ) : null}
          </>
        ) : (
          <p className="text-caption text-muted">Only staff with marketing access can change channels.</p>
        )}
      </section>
    </div>
  );
}
