import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { platformOrigin } from "@/lib/platform/urls";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { getMetaWebhookVerifyToken, listAppCredentialStatus } from "@/features/platform-apps/server";
import { envNamesFor, type AppCredentialStatus } from "@/features/platform-apps/core";
import { setupGuides, type SetupGuide } from "@/features/platform-apps/setup";
import { AppCredentialForm, VerifyTokenControl } from "@/features/platform-apps/components/credential-forms";

export const metadata: Metadata = { title: "Social apps" };

function StatusBadge({ s }: { s: AppCredentialStatus }) {
  if (s.configured) return <Badge tone="success">{s.source === "db" ? "Configured" : "Configured (env)"}</Badge>;
  if (s.incomplete) return <Badge tone="warning">Incomplete</Badge>;
  return <Badge tone="neutral">Not configured</Badge>;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <p className="text-caption text-muted">{label}</p>
      <code className="block break-all rounded-md border border-border bg-surface-secondary px-2 py-1 text-caption">{value}</code>
    </li>
  );
}

function Guide({ g, s, verifyToken }: { g: SetupGuide; s: AppCredentialStatus; verifyToken: string | null }) {
  const env = envNamesFor(g.provider);
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {g.title} <StatusBadge s={s} />
        </span>
      }
      description={g.covers}
      actions={
        <a href={g.consoleUrl} target="_blank" rel="noopener noreferrer" className="text-small text-accent hover:underline">
          {g.consoleLabel} ↗
        </a>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <AppCredentialForm provider={g.provider} idLabel={g.idLabel} secretLabel={g.secretLabel} clientId={s.source === "env" ? null : s.clientId} secretHint={s.source === "db" ? s.secretHint : null} savedInDb={s.savedInDb} />
          {s.source === "env" ? (
            <p className="text-caption text-muted">
              Currently using env vars ({[env.id, env.secret].filter(Boolean).join(", ")}{s.secretHint ? `, secret ending ${s.secretHint}` : ""}). Saving here overrides them.
            </p>
          ) : (
            <p className="text-caption text-muted">Env fallback: {[env.id, env.secret].filter(Boolean).join(", ")}.</p>
          )}
          {g.redirectUris.length || g.webhooks.length ? (
            <div>
              <h3 className="mb-2 text-small font-medium">Register these URLs exactly</h3>
              <ul className="space-y-2">
                {g.redirectUris.map((u) => (
                  <CopyRow key={u} label="OAuth redirect URI" value={u} />
                ))}
                {g.webhooks.map((w) => (
                  <CopyRow key={w.url} label={`Webhook callback: ${w.label}`} value={w.url} />
                ))}
              </ul>
            </div>
          ) : null}
          {g.provider === "meta" ? (
            <div>
              <h3 className="mb-2 text-small font-medium">Webhook verify token</h3>
              <VerifyTokenControl token={verifyToken} />
            </div>
          ) : null}
          {g.permissions.length ? (
            <div>
              <h3 className="mb-2 text-small font-medium">Permissions / scopes</h3>
              <ul className="space-y-1 text-small">
                {g.permissions.map((p) => (
                  <li key={p.name}>
                    <code className="text-caption">{p.name}</code>
                    {p.note ? <span className="text-muted"> ({p.note})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div>
          <h3 className="mb-2 text-small font-medium">Setup checklist</h3>
          <ol className="list-decimal space-y-2 pl-5 text-small">
            {g.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-caption">{g.review}</p>
        </div>
      </div>
    </Card>
  );
}

/** Platform OAuth apps and AI keys. Secrets are write-only; only "configured", source and a masked hint are shown. */
export default async function SocialAppsPage() {
  const ctx = await requirePlatform("platform.settings.manage");
  const [statuses, verifyToken] = await Promise.all([listAppCredentialStatus(ctx), getMetaWebhookVerifyToken(ctx)]);
  const byProvider = new Map(statuses.map((s) => [s.provider, s]));
  const guides = setupGuides(platformOrigin());
  return (
    <div className="space-y-6">
      <PageHeader title="Social apps" description="Add the platform's Meta, Pinterest and Google apps, and the AI API keys, so sellers can connect their own accounts. Values are stored encrypted, every change is audited, and secrets can't be viewed after saving." />
      {guides.map((g) => (
        <Guide key={g.provider} g={g} s={byProvider.get(g.provider)!} verifyToken={g.provider === "meta" ? verifyToken : null} />
      ))}
    </div>
  );
}
