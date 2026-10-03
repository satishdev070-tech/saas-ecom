import type { Metadata } from "next";
import { requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { listIntegrationSummaries } from "@/features/integrations/server/store";
import { PROVIDERS } from "@/features/integrations/registry";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Security & activity" };

const SENSITIVE = ["integration.%", "members.%", "roles.%", "role.%", "invitation.%", "theme.%", "settings.%", "payments.%", "order.refund%", "domain.%", "social.%"];

export default async function SecurityPage() {
  const ctx = await requireTenantPermission("members.manage");
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, integrations] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("id, action, actor_type, actor_user_id, entity_type, entity_id, created_at")
      .eq("tenant_id", ctx.tenantId)
      .or(SENSITIVE.map((p) => `action.like.${p}`).join(","))
      .order("created_at", { ascending: false })
      .limit(50),
    listIntegrationSummaries(ctx.tenantId),
  ]);
  const connected = integrations.filter((i) => i.status !== "not_connected");
  return (
    <div className="space-y-6">
      <PageHeader title="Security & activity" description="Who changed sensitive settings, and which outside services can act for your store." />
      <Card title="Connected services" description="Credentials are encrypted and never shown. Disconnect anything you no longer use.">
        {connected.length ? (
          <ul className="divide-y divide-border text-small">
            {connected.map((i) => (
              <li key={i.provider} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{PROVIDERS[i.provider].label}</span>
                <span className="text-muted">
                  {i.status}
                  {i.enabled ? " · on" : " · off"}
                  {i.lastVerifiedAt ? ` · checked ${formatDateTime(i.lastVerifiedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted">No outside services are connected.</p>
        )}
      </Card>
      <Card title="Sensitive activity" description="Payments, integrations, team, roles, theme publishing, domains and refunds. Last 50 events.">
        {events?.length ? (
          <Table caption="Sensitive activity">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Action</th>
                <th className={th}>By</th>
                <th className={th}>Item</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTime(e.created_at)}</td>
                  <td className={td}><code className="text-caption">{e.action}</code></td>
                  <td className={`${td} text-muted`}>{e.actor_user_id === ctx.user.id ? "You" : e.actor_type === "user" ? "Team member" : e.actor_type}</td>
                  <td className={`${td} max-w-48 truncate text-muted`}>{e.entity_type ? `${e.entity_type}${e.entity_id ? ` · ${e.entity_id.slice(0, 12)}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No sensitive changes yet" description="Changes to payments, integrations, team and roles will appear here." />
        )}
      </Card>
    </div>
  );
}
