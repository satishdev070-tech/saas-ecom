"use client";

import { useActionState, useState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/form";
import { Badge } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { ActionDialog, HiddenFields, InlineAction } from "@/features/settings/ui/action-controls";
import type { ActionResult } from "@/lib/actions/result";
import { PROVIDERS, maskSecret, type IntegrationStatus, type ProviderId } from "../registry";
import { disconnectIntegrationAction, saveIntegrationAction, testIntegrationAction, toggleIntegrationAction } from "../actions";

/** Serializable subset of IntegrationSummary sent to the browser (no secret values, only last-4 hints). */
export type IntegrationCardData = {
  provider: ProviderId;
  enabled: boolean;
  environment: "test" | "live";
  status: IntegrationStatus;
  statusMessage: string | null;
  lastVerifiedAt: string | null;
  public: Record<string, string>;
  secretHints: Record<string, string | null>;
  featureEnabled: boolean;
};

const STATUS: Record<IntegrationStatus, { label: string; tone: "neutral" | "success" | "warning" | "error" }> = {
  not_connected: { label: "Not connected", tone: "neutral" },
  connected: { label: "Connected", tone: "success" },
  error: { label: "Error", tone: "error" },
  expired: { label: "Expired", tone: "warning" },
  disabled: { label: "Disabled", tone: "neutral" },
};

export function IntegrationStatusBadge({ status, enabled }: { status: IntegrationStatus; enabled: boolean }) {
  const s = status === "connected" && !enabled ? { label: "Connected · off", tone: "neutral" as const } : STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function Result({ state }: { state: ActionResult<string> | null }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">
      {state.data}
    </p>
  ) : (
    <p role="alert" className="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">
      {state.error.fieldErrors?._form?.[0] ?? state.error.message}
    </p>
  );
}

export function IntegrationCard({ data, canManage, extra }: { data: IntegrationCardData; canManage: boolean; extra?: React.ReactNode }) {
  const def = PROVIDERS[data.provider];
  const configured = data.status !== "not_connected" || Object.keys(data.public).length > 0 || Object.values(data.secretHints).some(Boolean);
  const [editing, setEditing] = useState(!configured);
  const [saveState, saveAction] = useActionState(saveIntegrationAction, null);
  const [testState, testAction] = useActionState(testIntegrationAction, null);
  const errors = saveState && !saveState.ok ? (saveState.error.fieldErrors ?? {}) : {};

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{def.label}</h2>
            <IntegrationStatusBadge status={data.status} enabled={data.enabled} />
            {configured && (def.environments || data.provider === "razorpay") ? <Badge tone={data.environment === "live" ? "accent" : "info"}>{data.environment === "live" ? "Live" : "Test"}</Badge> : null}
          </div>
          <p className="mt-1 text-small text-muted">{def.description}</p>
          {data.statusMessage && data.status !== "not_connected" ? <p className={`mt-1 text-small ${data.status === "connected" ? "text-muted" : "text-error"}`}>{data.statusMessage}</p> : null}
          {data.lastVerifiedAt ? <p className="mt-0.5 text-caption text-muted">Last checked {new Date(data.lastVerifiedAt).toLocaleString("en-IN")}</p> : null}
        </div>
        <a href={def.docsUrl} target="_blank" rel="noreferrer" className="text-small text-accent hover:underline">
          Where do I find these?
        </a>
      </header>

      {!data.featureEnabled ? (
        <p className="mt-4 rounded-md bg-surface-secondary px-3 py-2 text-small text-muted">{def.label} isn&apos;t available on your current plan. Contact support to enable it.</p>
      ) : !canManage ? (
        <p className="mt-4 text-small text-muted">You can view this integration but not change it.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {configured && !editing ? (
            <dl className="grid gap-x-6 gap-y-2 text-small sm:grid-cols-2">
              {def.fields.map((f) => (
                <div key={f.key} className="flex justify-between gap-3 border-b border-border py-1.5 sm:block sm:border-0 sm:py-0">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="truncate font-mono">{f.secret ? maskSecret(data.secretHints[f.key] ?? null) : data.public[f.key] || "Not set"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <form action={saveAction} className="space-y-3">
              <HiddenFields fields={{ provider: data.provider }} />
              <div className="grid gap-3 sm:grid-cols-2">
                {def.environments ? (
                  <SelectField
                    label="Environment"
                    name="environment"
                    defaultValue={data.environment}
                    options={[
                      { value: "test", label: "Test / sandbox" },
                      { value: "live", label: "Live / production" },
                    ]}
                    className="sm:col-span-2"
                  />
                ) : null}
                {def.fields.map((f) => (
                  <TextField
                    key={f.key}
                    label={f.label}
                    name={f.key}
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    defaultValue={f.secret ? "" : (data.public[f.key] ?? "")}
                    placeholder={f.secret && data.secretHints[f.key] ? `Saved (${maskSecret(data.secretHints[f.key] ?? null)}). Leave blank to keep` : f.placeholder}
                    hint={f.help ?? f.patternHint}
                    optional={!f.required}
                    errors={errors[f.key]}
                  />
                ))}
              </div>
              <Result state={saveState} />
              <div className="flex flex-wrap gap-2">
                <SubmitButton size="sm">Save &amp; test connection</SubmitButton>
                {configured ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              <p className="text-caption text-muted">Secrets are encrypted before they&apos;re stored and are never shown again.</p>
            </form>
          )}

          {extra}

          {configured && !editing ? (
            <div className="flex flex-wrap items-start gap-2 border-t border-border pt-4">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit credentials
              </Button>
              {def.testable ? (
                <form action={testAction}>
                  <HiddenFields fields={{ provider: data.provider }} />
                  <SubmitButton size="sm" variant="secondary">
                    Test connection
                  </SubmitButton>
                </form>
              ) : null}
              {data.status === "connected" ? (
                <InlineAction
                  action={toggleIntegrationAction}
                  fields={{ provider: data.provider, enabled: data.enabled ? "false" : "true" }}
                  label={data.enabled ? "Disable" : "Enable"}
                  variant={data.enabled ? "secondary" : "primary"}
                />
              ) : null}
              <ActionDialog
                action={disconnectIntegrationAction}
                fields={{ provider: data.provider }}
                title={`Disconnect ${def.label}?`}
                description="The saved credentials are deleted and this integration stops working immediately. Past orders and shipments are not affected."
                triggerLabel="Disconnect"
                triggerVariant="ghost"
                confirmLabel="Disconnect"
                variant="danger"
              />
            </div>
          ) : null}
          {!editing ? <Result state={testState} /> : null}
        </div>
      )}
    </section>
  );
}

/** Read-only row for places that only need the state (e.g. a settings overview). */
export function IntegrationSummaryRow({ data }: { data: IntegrationCardData }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-small">
      <span>{PROVIDERS[data.provider].label}</span>
      <IntegrationStatusBadge status={data.status} enabled={data.enabled} />
    </div>
  );
}

