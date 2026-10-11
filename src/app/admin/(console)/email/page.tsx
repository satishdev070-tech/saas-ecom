import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { getEmailDeliveryOverview, getEmailProviderStatus } from "@/features/platform-apps/server";
import { platformOrigin } from "@/lib/platform/urls";
import { formatDateTime } from "@/features/analytics/dates";
import { EmailProviderForm } from "@/features/platform-apps/components/credential-forms";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Email (Resend)" };

/** Platform email provider. The key is write-only: only "configured", its source and a masked hint are shown. */
export default async function EmailProviderPage() {
  const ctx = await requirePlatform("platform.settings.manage");
  const [s, d] = await Promise.all([getEmailProviderStatus(ctx), getEmailDeliveryOverview(ctx)]);
  const hookUrl = `${platformOrigin()}/api/auth/email-hook`;
  const domainTone = d.fromDomainStatus === "verified" ? "success" : d.fromDomainStatus ? "warning" : "neutral";
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
            <div className="mt-3 rounded-md border border-border bg-surface-secondary px-3 py-2 text-caption">
              <p className="font-medium">Sending domain{d.fromDomain ? `: ${d.fromDomain}` : ""}</p>
              {d.domains === null ? (
                <p className="mt-1 text-muted">Add an API key to check it.</p>
              ) : d.domains.ok ? (
                <p className="mt-1">
                  <Badge tone={domainTone}>{d.fromDomainStatus === "missing" ? "Not added in Resend" : (d.fromDomainStatus ?? "unknown")}</Badge>
                  {d.fromDomainStatus !== "verified" ? <span className="ml-2 text-muted">Emails from an unverified domain are rejected by Resend.</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-muted">{d.domains.reason === "restricted" ? "This key has sending-only access, so domain status can't be read here (that's fine). Check Resend → Domains." : "Couldn't read domains from Resend."}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Account emails through Resend {d.authHookConfigured ? <Badge tone="success">Hook secret set</Badge> : <Badge tone="warning">Not set up: Supabase sends these</Badge>}
          </span>
        }
        description="Sign-up confirmation, password reset, magic link, invite and email change emails for sellers and shoppers."
      >
        <ol className="list-decimal space-y-2 pl-5 text-small">
          <li>
            Supabase Dashboard → Authentication → <span className="font-medium">Hooks</span> → <span className="font-medium">Send Email hook</span> → type HTTPS, URL:
            <code className="mt-1 block break-all rounded bg-surface-secondary px-2 py-1 font-mono text-caption">{hookUrl}</code>
          </li>
          <li>Generate the hook secret there and set it as <code className="font-mono">SEND_EMAIL_HOOK_SECRET</code> in Vercel (Production), then redeploy.</li>
          <li>Enable the hook. From then on every auth email is branded (the store&apos;s name and logo for shoppers, the platform for sellers) and sent from your Resend domain.</li>
          <li>Test: use “Forgot password” on the seller sign-in page and check “Recent emails” below for an <code className="font-mono">auth_recovery</code> row.</li>
        </ol>
        <p className="mt-3 text-caption text-muted">Alternative without the hook: Supabase → Authentication → Emails → SMTP settings with host smtp.resend.com, port 465, user resend and a Resend API key as the password (unbranded Supabase templates).</p>
      </Card>

      <Card title="Recent emails" description={`Last 7 days: ${Object.entries(d.weekCounts).map(([k, v]) => `${v} ${k}`).join(" · ") || "none"}. Recipients are masked; bodies are never stored.`}>
        {d.recent.length ? (
          <Table caption="Recent emails">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Email</th>
                <th className={th}>To</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((r, i) => (
                <tr key={i}>
                  <td className={`${td} whitespace-nowrap text-muted`}>{formatDateTime(r.created_at)}</td>
                  <td className={`${td} font-mono text-caption`}>{r.kind}</td>
                  <td className={td}>{r.recipient_masked ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={r.status === "sent" ? "success" : r.status === "failed" ? "error" : "warning"}>{r.status}</Badge>
                    {r.error && r.status !== "sent" ? <p className="mt-1 max-w-[18rem] truncate text-caption text-muted" title={r.error}>{r.error}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-small text-muted">{d.logAvailable ? "No emails yet." : "The email log isn't available (apply migration 2200)."}</p>
        )}
      </Card>
    </div>
  );
}
