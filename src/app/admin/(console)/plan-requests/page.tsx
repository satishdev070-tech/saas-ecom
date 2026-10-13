import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/lib/platform/access";
import { Badge, PageHeader, Table, td, th } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { formatDate, formatDateTime } from "@/features/analytics/dates";
import { listPlanRequests } from "@/features/billing/server";
import { DecidePlanRequest } from "@/features/billing/components";
import { PLAN_REQUEST_STATUSES, type PlanRequestStatus } from "@/features/billing/schemas";

export const metadata: Metadata = { title: "Plan requests" };

const TONE = { pending: "warning", approved: "success", declined: "error", cancelled: "neutral" } as const;

export default async function PlanRequestsPage({ searchParams }: PageProps<"/admin/plan-requests">) {
  const ctx = await requirePlatform("platform.tenants.read");
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "pending";
  const status = raw === "all" ? undefined : (PLAN_REQUEST_STATUSES as readonly string[]).includes(raw) ? (raw as PlanRequestStatus) : "pending";
  const { rows, available } = await listPlanRequests(ctx, { status });
  const manage = ctx.permissions.has("platform.tenants.manage");
  const tabs = ["pending", "approved", "declined", "cancelled", "all"];

  return (
    <div className="space-y-4">
      <PageHeader title="Plan requests" description="Stores asking to upgrade, downgrade or activate a plan. Approving switches the plan and makes the store active." />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-small">
        {tabs.map((t) => (
          <Link key={t} href={`/admin/plan-requests?status=${t}`} className={`rounded-md border px-3 py-1 capitalize ${(status ?? "all") === t ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground"}`}>
            {t}
          </Link>
        ))}
      </nav>
      {!available ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-small">Apply migration 2900 (supabase/dev/apply-2900.sql) to enable plan requests.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No requests" description={status === "pending" ? "Nothing is waiting for a decision." : "No requests with this status."} />
      ) : (
        <Table caption="Plan requests">
          <thead>
            <tr>
              <th className={th}>Store</th>
              <th className={th}>Request</th>
              <th className={th}>Now</th>
              <th className={th}>Sent</th>
              <th className={th}>Status</th>
              {manage ? <th className={th}>Decision</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <Link href={`/admin/tenants/${r.tenantId}`} className="font-medium text-accent hover:underline">
                    {r.storeName}
                  </Link>
                  <p className="text-xs text-muted">{r.storeSlug}</p>
                </td>
                <td className={td}>
                  <span className="font-medium">{r.planName}</span> · {r.cycle}
                  {r.note ? <p className="max-w-[18rem] text-xs text-muted">“{r.note}”</p> : null}
                </td>
                <td className={td}>
                  {r.currentPlanName ?? "—"}
                  <p className="text-xs text-muted">
                    {r.storeStatus}
                    {r.storeStatus === "trial" && r.trialEndsAt ? ` · ends ${formatDate(r.trialEndsAt)}` : ""}
                  </p>
                </td>
                <td className={`${td} whitespace-nowrap text-muted`}>{formatDateTime(r.createdAt)}</td>
                <td className={td}>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                  {r.decisionNote ? <p className="mt-1 max-w-[14rem] text-xs text-muted">{r.decisionNote}</p> : null}
                </td>
                {manage ? <td className={td}>{r.status === "pending" ? <DecidePlanRequest requestId={r.id} planName={r.planName} storeName={r.storeName} /> : null}</td> : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
