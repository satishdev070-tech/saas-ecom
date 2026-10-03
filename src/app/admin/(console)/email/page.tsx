import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { getEmailProviderStatus } from "@/features/platform-apps/server";
import { EmailProviderForm } from "@/features/platform-apps/components/credential-forms";
import { Badge, Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Email (Resend)" };

/** Platform email provider. The key is write-only: only "configured", its source and a masked hint are shown. */
export default async function EmailProviderPage() {
  const ctx = await requirePlatform("platform.settings.manage");
  const s = await getEmailProviderStatus(ctx);
  return (
    <div className="space-y-4">
      <PageHeader title="Email (Resend)" description="Transactional email for the whole platform: order confirmations and updates sent by stores, and account emails. Saved values override the RESEND_API_KEY and EMAIL_FROM env vars; every change is audited." />
      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Resend {s.configured ? <Badge tone="success">{s.source === "db" ? "Configured" : "Configured (env)"}</Badge> : <Badge tone="warning">Not configured: emails are logged, not sent</Badge>}
          </span>
        }
        actions={
          <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-small text-accent hover:underline">
            Resend dashboard ↗
          </a>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailProviderForm from={s.dbFrom ?? s.from} secretHint={s.source === "db" ? s.secretHint : null} savedInDb={s.savedInDb} configured={s.configured} />
          <div>
            <h3 className="mb-2 text-small font-medium">Setup checklist</h3>
            <ol className="list-decimal space-y-2 pl-5 text-small">
              <li>Resend → Domains → Add domain (e.g. mail.buildbrighten.in) and add the DNS records it shows (SPF, DKIM, and the MX for bounces) at your DNS provider.</li>
              <li>Wait for the domain to show “Verified”.</li>
              <li>Resend → API Keys → Create API key with “Sending access”, limited to that domain.</li>
              <li>Paste the key and a From address on the verified domain here, save, then send yourself a test email.</li>
            </ol>
            {s.source === "env" ? <p className="mt-3 text-caption text-muted">Currently using the RESEND_API_KEY env var{s.secretHint ? ` (ending ${s.secretHint})` : ""}. Saving a key here overrides it.</p> : null}
            <p className="mt-3 rounded-md border border-border bg-surface-secondary px-3 py-2 text-caption">Supabase Auth emails (sign-up confirmation, password reset) are sent by Supabase. To send them through Resend too, set Resend&apos;s SMTP details in Supabase → Authentication → Emails → SMTP settings.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
