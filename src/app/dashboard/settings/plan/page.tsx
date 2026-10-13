import type { Metadata } from "next";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { InlineAction } from "@/features/settings/ui/action-controls";
import { formatDate } from "@/features/analytics/dates";
import { featureLabels, getStorePlanOverview } from "@/features/billing/server";
import { PlanPicker } from "@/features/billing/components";
import { cancelPlanRequestAction } from "@/features/billing/actions";
import { daysUntil } from "@/features/billing/schemas";

export const metadata: Metadata = { title: "Plan & billing" };

const STATUS_TONE = { trial: "accent", active: "success", suspended: "error", cancelled: "neutral" } as const;
const REQUEST_TONE = { pending: "warning", approved: "success", declined: "error", cancelled: "neutral" } as const;

export default async function PlanPage() {
  const ctx = await requireTenantPermission("store.read");
  const [o, labels] = await Promise.all([getStorePlanOverview(ctx), featureLabels()]);
  const pending = o.requests.find((r) => r.status === "pending") ?? null;
  const owner = can(ctx, "billing.manage");
  const trialDays = daysUntil(o.trialEndsAt);
  const limit = (k: string) => o.current?.limits[k] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & billing" description="Your current plan, what it includes, and requests to upgrade or activate a plan." />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-small text-muted">Current plan</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-h2">
              {o.current?.name ?? "No plan"}
              <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE] ?? "neutral"}>{o.status === "trial" ? "Free trial" : o.status}</Badge>
            </p>
            {o.status === "trial" ? (
              <p className={`mt-1 text-small ${trialDays !== null && trialDays < 0 ? "text-error" : "text-muted"}`}>
                {o.trialEndsAt ? (trialDays !== null && trialDays < 0 ? `Trial ended on ${formatDate(o.trialEndsAt)}. Choose a plan below to activate your store.` : `Trial ends on ${formatDate(o.trialEndsAt)} (${trialDays} day${trialDays === 1 ? "" : "s"} left).`) : "Free trial."}
              </p>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-small">
            <dt className="text-muted">Products</dt>
            <dd className="tabular-nums">
              {o.usage.products}
              {limit("products") !== null ? ` / ${limit("products")}` : ""}
            </dd>
            <dt className="text-muted">Staff</dt>
            <dd className="tabular-nums">
              {o.usage.staff}
              {limit("staff") !== null ? ` / ${limit("staff")}` : ""}
            </dd>
          </dl>
        </div>
      </Card>

      {pending ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-small">
          <p>
            <span className="font-medium">Request pending:</span> {pending.planName} ({pending.cycle}), sent {formatDate(pending.createdAt)}. Our team will confirm and activate it.
          </p>
          {owner ? <InlineAction action={cancelPlanRequestAction} fields={{ requestId: pending.id }} label="Cancel request" variant="ghost" /> : null}
        </div>
      ) : null}

      {o.requestsAvailable ? (
        <PlanPicker
          plans={o.plans.map((p) => ({ id: p.id, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, limits: p.limits, features: p.features }))}
          currentId={o.current?.id ?? null}
          status={o.status}
          featureLabels={labels}
          canRequest={owner}
          pendingPlanId={pending?.planId ?? null}
        />
      ) : (
        <p className="rounded-md border border-border bg-surface p-4 text-small text-muted">Plan requests are being set up. Please contact support to change your plan.</p>
      )}

      {o.requests.filter((r) => r.status !== "pending").length ? (
        <Card title="Request history">
          <ul className="divide-y divide-border text-small">
            {o.requests
              .filter((r) => r.status !== "pending")
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.planName} ({r.cycle}) · {formatDate(r.createdAt)}
                    {r.decisionNote ? <span className="block text-caption text-muted">{r.decisionNote}</span> : null}
                  </span>
                  <Badge tone={REQUEST_TONE[r.status]}>{r.status}</Badge>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
