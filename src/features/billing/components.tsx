"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { formatMoney, toMinor } from "@/lib/money";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { ActionDialog } from "@/features/settings/ui/action-controls";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { activatePlanAction, decidePlanRequestAction, requestPlanAction } from "./actions";
import { requestKind, yearlySavingPercent, type BillingCycle } from "./schemas";

export type PlanCardData = {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  limits: Record<string, number | null>;
  features: string[];
};

const LIMIT_LABELS: Record<string, (n: number | null) => string> = {
  products: (n) => (n === null ? "Unlimited products" : `Up to ${n.toLocaleString("en-IN")} products`),
  staff: (n) => (n === null ? "Unlimited staff" : `${n} staff account${n === 1 ? "" : "s"}`),
  storage_mb: (n) => (n === null ? "Unlimited storage" : `${n >= 1024 ? `${Math.round(n / 1024)} GB` : `${n} MB`} media storage`),
  custom_domains: (n) => (n === null ? "Unlimited custom domains" : n === 0 ? "No custom domain" : `${n} custom domain${n === 1 ? "" : "s"}`),
};

const KIND_LABEL = { upgrade: "Upgrade", downgrade: "Downgrade", activate: "Activate", change: "Switch" } as const;

/** Plan cards + monthly/yearly toggle + note → requestPlanAction (owner only). */
export function PlanPicker({ plans, currentId, status, featureLabels, canRequest, pendingPlanId }: { plans: PlanCardData[]; currentId: string | null; status: string; featureLabels: Record<string, string>; canRequest: boolean; pendingPlanId: string | null }) {
  const [state, action] = useActionState(requestPlanAction, null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const current = plans.find((p) => p.id === currentId) ?? null;
  const notActive = status === "trial" || status === "suspended";
  const [choice, setChoice] = useState<string>(pendingPlanId ?? (notActive ? (currentId ?? plans[0]?.id ?? "") : (plans.find((p) => current && p.priceMonthly > current.priceMonthly)?.id ?? currentId ?? "")));
  const chosen = plans.find((p) => p.id === choice) ?? null;
  const kind = chosen ? requestKind(current, chosen, notActive) : null;
  const sameAsCurrent = chosen?.id === currentId && !notActive;

  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} success="Request sent. We'll confirm by email once your plan is active." />
      <div className="inline-flex rounded-md border border-border p-0.5 text-small" role="radiogroup" aria-label="Billing cycle">
        {(["monthly", "yearly"] as const).map((c) => (
          <label key={c} className={`cursor-pointer rounded px-3 py-1.5 ${cycle === c ? "bg-primary text-primary-foreground" : "text-muted"}`}>
            <input type="radio" name="cycle" value={c} checked={cycle === c} onChange={() => setCycle(c)} className="sr-only" />
            {c === "monthly" ? "Monthly" : "Yearly"}
          </label>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === currentId;
          const price = cycle === "monthly" ? p.priceMonthly : p.priceYearly;
          const save = yearlySavingPercent(p.priceMonthly, p.priceYearly);
          return (
            <label key={p.id} className={`flex cursor-pointer flex-col rounded-lg border p-5 transition ${choice === p.id ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-foreground/30"} ${canRequest ? "" : "cursor-default"}`}>
              <input type="radio" name="planId" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} disabled={!canRequest} className="sr-only" />
              <span className="flex items-center justify-between gap-2">
                <span className="text-h3">{p.name}</span>
                {isCurrent ? <span className="rounded bg-surface-secondary px-2 py-0.5 text-caption font-medium">{notActive ? `Current (${status})` : "Current plan"}</span> : null}
                {pendingPlanId === p.id ? <span className="rounded bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning">Requested</span> : null}
              </span>
              {p.description ? <span className="mt-1 text-small text-muted">{p.description}</span> : null}
              <span className="mt-3 text-h1 tabular-nums">
                {price > 0 ? formatMoney(toMinor(price)) : "Free"}
                {price > 0 ? <span className="text-small font-normal text-muted"> / {cycle === "monthly" ? "month" : "year"}</span> : null}
              </span>
              {cycle === "yearly" && save > 0 ? <span className="text-caption text-success">Save {save}% vs monthly</span> : null}
              <ul className="mt-4 space-y-1.5 text-small">
                {Object.entries(p.limits).map(([k, v]) => (LIMIT_LABELS[k] ? <li key={k} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{LIMIT_LABELS[k](v)}</li> : null))}
                {p.features.slice(0, 8).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    {featureLabels[f] ?? f.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </label>
          );
        })}
      </div>
      {canRequest ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <TextAreaField label="Message for our team" name="note" rows={2} maxLength={500} optional errors={fieldErrors(state).note} hint="e.g. GST details for the invoice, or the best time to call you." />
          <SubmitButton disabled={!chosen || sameAsCurrent}>{chosen ? (sameAsCurrent ? "This is your current plan" : `${KIND_LABEL[kind!]} to ${chosen.name}${cycle === "yearly" ? " (yearly)" : ""}`) : "Choose a plan"}</SubmitButton>
          <p className="text-caption text-muted">Our team confirms the request and activates the plan; your store keeps working meanwhile. Payment details are shared with you by our team.</p>
        </div>
      ) : (
        <p className="text-small text-muted">Only the store owner can change the plan.</p>
      )}
    </form>
  );
}

// ---- Platform ---------------------------------------------------------------------------

export function DecidePlanRequest({ requestId, planName, storeName }: { requestId: string; planName: string; storeName: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        action={decidePlanRequestAction}
        fields={{ requestId, decision: "approve" }}
        title={`Approve ${planName} for ${storeName}?`}
        description="Switches the store to this plan and makes it active (ends the trial or lifts a suspension). Audited."
        triggerLabel="Approve"
        triggerVariant="primary"
        confirmLabel="Approve & activate"
        success="Approved."
      >
        {(e) => (
          <>
            <TextField label="Paid for (months)" name="months" type="number" min={1} max={60} optional errors={e.months} hint="Recorded in the audit log, e.g. 1 or 12." />
            <TextAreaField label="Note" name="note" rows={2} maxLength={500} optional errors={e.note} hint="e.g. payment reference." />
          </>
        )}
      </ActionDialog>
      <ActionDialog action={decidePlanRequestAction} fields={{ requestId, decision: "decline" }} title="Decline this request?" triggerLabel="Decline" triggerVariant="ghost" confirmLabel="Decline" variant="danger" success="Declined.">
        {(e) => <TextAreaField label="Reason" name="note" rows={2} maxLength={500} optional errors={e.note} />}
      </ActionDialog>
    </div>
  );
}

export function ActivatePlanForm({ tenantId, planId, plans }: { tenantId: string; planId: string | null; plans: { value: string; label: string }[] }) {
  return (
    <ActionDialog
      action={activatePlanAction}
      fields={{ tenantId }}
      title="Activate a paid plan"
      description="Sets the plan and makes the store active (ends a trial or lifts a suspension) in one step. Audited."
      triggerLabel="Activate plan"
      triggerVariant="primary"
      confirmLabel="Activate"
      success="Plan activated."
    >
      {(e) => (
        <>
          <SelectField label="Plan" name="planId" defaultValue={planId ?? ""} options={[{ value: "", label: "Choose…" }, ...plans]} errors={e.planId} />
          <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={2} errors={e.reason} hint="e.g. payment received, reference no." />
        </>
      )}
    </ActionDialog>
  );
}

