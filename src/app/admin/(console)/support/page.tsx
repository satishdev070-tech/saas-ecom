import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { listSupportSessions } from "@/features/platform/server/queries";
import { supportSessionState } from "@/features/platform/stats";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/features/analytics/dates";

export const metadata: Metadata = { title: "Support sessions" };

export default async function SupportSessionsPage() {
  await requirePlatform("platform.support.impersonate");
  const rows = await listSupportSessions({ limit: 100 });
  return (
    <div>
      <PageHeader title="Support sessions" description="Time-boxed, read-only access to a store's data. Start one from a store's page." />
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Store</th>
              <th className={th}>Agent</th>
              <th className={th}>Reason</th>
              <th className={th}>Started</th>
              <th className={th}>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const st = supportSessionState({ ended_at: s.endedAt, expires_at: s.expiresAt });
              return (
                <tr key={s.id}>
                  <td className={td}>
                    <Link href={`/admin/tenants/${s.tenantId}`} className="font-medium hover:underline">
                      {s.tenantName ?? s.tenantId}
                    </Link>
                  </td>
                  <td className={td}>{s.platformUserEmail ?? "—"}</td>
                  <td className={`${td} max-w-xs truncate`} title={s.reason}>
                    {s.reason}
                  </td>
                  <td className={td}>{formatDateTime(s.startedAt)}</td>
                  <td className={td}>
                    <Badge tone={st.state === "active" ? "warning" : "neutral"}>{st.state === "active" ? `active · ${st.minutesLeft} min` : st.state}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No support sessions yet" />
      )}
    </div>
  );
}
