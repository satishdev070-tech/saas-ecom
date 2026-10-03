"use client";

import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  addPlatformUserAction,
  changeTenantPlanAction,
  createFeatureFlagAction,
  createTenantAction,
  deleteFeatureFlagAction,
  deletePlanAction,
  endSupportSessionAction,
  extendTrialAction,
  recheckDomainAction,
  removePlatformUserAction,
  savePlanAction,
  setFlagOverrideAction,
  setTenantStatusAction,
  startSupportSessionAction,
  updateFeatureFlagAction,
  updatePlatformSettingAction,
  updatePlatformUserAction,
} from "@/features/platform/actions";
import { PLAN_LIMIT_KEYS, SUPPORT_DURATIONS, planFeatureField } from "@/features/platform/schemas";

type Opt = { value: string; label: string };
const STATUS_OPTS: Opt[] = ["trial", "active", "suspended", "cancelled"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }));
const ROLE_OPTS: Opt[] = [
  { value: "super_admin", label: "Super admin — everything" },
  { value: "support", label: "Support — tenants, support sessions, audit" },
  { value: "finance", label: "Finance — plans, usage" },
];

// ---- Tenants -------------------------------------------------------------------------

export function TenantStatusForm({ tenantId, status }: { tenantId: string; status: string }) {
  return (
    <ActionDialog action={setTenantStatusAction} fields={{ tenantId, confirm: "yes" }} title="Change store status" description="Suspended and cancelled stores are hidden from shoppers. The change is audited." triggerLabel="Change status" confirmLabel="Change status" variant="danger" success="Status updated.">
      {(e) => (
        <>
          <SelectField label="Status" name="status" defaultValue={status} options={STATUS_OPTS} errors={e.status} />
          <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={3} errors={e.reason} hint="Visible in the audit log." />
        </>
      )}
    </ActionDialog>
  );
}

export function ChangePlanForm({ tenantId, planId, plans }: { tenantId: string; planId: string | null; plans: Opt[] }) {
  return (
    <ActionDialog action={changeTenantPlanAction} fields={{ tenantId }} title="Change plan" triggerLabel="Change plan" confirmLabel="Save" success="Plan updated.">
      {(e) => <SelectField label="Plan" name="planId" defaultValue={planId ?? ""} options={[{ value: "", label: "Choose…" }, ...plans]} errors={e.planId} />}
    </ActionDialog>
  );
}

export function ExtendTrialForm({ tenantId }: { tenantId: string }) {
  return (
    <ActionDialog action={extendTrialAction} fields={{ tenantId }} title="Extend trial" triggerLabel="Extend trial" confirmLabel="Extend" success="Trial extended.">
      {(e) => <TextField label="Days" name="days" type="number" min={1} max={90} defaultValue="14" required errors={e.days} />}
    </ActionDialog>
  );
}

export function CreateTenantForm({ plans }: { plans: Opt[] }) {
  return (
    <ActionForm action={createTenantAction} submitLabel="Create store" success="Store created.">
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Owner email" name="ownerEmail" type="email" required errors={e.ownerEmail} hint="The user must already have an account." />
          <TextField label="Store name" name="name" required maxLength={120} errors={e.name} />
          <TextField label="Store address (slug)" name="slug" required pattern="[a-z0-9-]{3,63}" errors={e.slug} hint="Lowercase letters, numbers and hyphens." />
          <SelectField label="Plan" name="planId" defaultValue="" options={[{ value: "", label: "Default plan" }, ...plans]} errors={e.planId} />
          <SelectField label="Status" name="status" defaultValue="trial" options={STATUS_OPTS.slice(0, 2)} errors={e.status} />
        </div>
      )}
    </ActionForm>
  );
}

export function FlagOverrideForm({ tenantId, flagKey, value }: { tenantId: string; flagKey: string; value: "on" | "off" | "inherit" }) {
  return (
    <ActionForm action={setFlagOverrideAction} fields={{ tenantId, key: flagKey }} submitLabel="Set" success="Saved." submitVariant="secondary" className="flex flex-wrap items-end gap-2">
      {() => (
        <SelectField
          label={<span className="sr-only">Override for {flagKey}</span>}
          name="value"
          id={`ov-${flagKey}`}
          defaultValue={value}
          options={[
            { value: "inherit", label: "Inherit from plan" },
            { value: "on", label: "Force on" },
            { value: "off", label: "Force off" },
          ]}
        />
      )}
    </ActionForm>
  );
}

export function StartSupportForm({ tenantId }: { tenantId: string }) {
  return (
    <ActionDialog action={startSupportSessionAction} fields={{ tenantId }} title="Start a read-only support session" description="You get viewer access to this store's data until the session expires. The store's audit log records it." triggerLabel="Start support session" confirmLabel="Start session">
      {(e) => (
        <>
          <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={3} errors={e.reason} hint="E.g. the ticket number and what you need to check." />
          <SelectField label="Duration" name="minutes" defaultValue="60" options={SUPPORT_DURATIONS.map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}` }))} errors={e.minutes} />
        </>
      )}
    </ActionDialog>
  );
}

export function EndSupportButton({ sessionId, tenantId }: { sessionId: string; tenantId: string }) {
  return <InlineAction action={endSupportSessionAction} fields={{ sessionId, tenantId }} label="End session" variant="danger" />;
}

// ---- Plans ---------------------------------------------------------------------------

export type PlanFormValue = {
  id?: string;
  code: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  trialDays: string;
  sortOrder: string;
  active: boolean;
  limits: Partial<Record<(typeof PLAN_LIMIT_KEYS)[number], number | null>>;
  features: Record<string, "inherit" | "on" | "off">;
};

const LIMIT_LABEL: Record<(typeof PLAN_LIMIT_KEYS)[number], string> = { products: "Products", staff: "Staff seats", storage_mb: "Storage (MB)", custom_domains: "Custom domains" };

export function PlanForm({ value, catalogue }: { value: PlanFormValue; catalogue: string[] }) {
  return (
    <ActionForm action={savePlanAction} fields={value.id ? { id: value.id } : {}} submitLabel={value.id ? "Save plan" : "Create plan"}>
      {(e) => (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Code" name="code" defaultValue={value.code} required errors={e.code} hint="Stable identifier, e.g. growth" />
            <TextField label="Name" name="name" defaultValue={value.name} required errors={e.name} />
            <TextField label="Monthly price (₹)" name="priceMonthly" inputMode="decimal" defaultValue={value.priceMonthly} required errors={e.priceMonthly} />
            <TextField label="Yearly price (₹)" name="priceYearly" inputMode="decimal" defaultValue={value.priceYearly} required errors={e.priceYearly} />
            <TextField label="Trial days" name="trialDays" type="number" min={0} max={90} defaultValue={value.trialDays} errors={e.trialDays} />
            <TextField label="Sort order" name="sortOrder" type="number" min={0} defaultValue={value.sortOrder} errors={e.sortOrder} />
            <TextAreaField label="Description" name="description" defaultValue={value.description} rows={2} optional className="sm:col-span-2" errors={e.description} />
            <CheckboxField label="Active (available for new stores)" name="active" defaultChecked={value.active} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Limits</legend>
            <p className="mb-3 text-xs text-muted">Leave blank for unlimited.</p>
            <div className="grid gap-4 sm:grid-cols-4">
              {PLAN_LIMIT_KEYS.map((k) => (
                <TextField key={k} label={LIMIT_LABEL[k]} name={`limit_${k}`} type="number" min={0} defaultValue={value.limits[k] ?? ""} optional errors={e[`limit_${k}`]} />
              ))}
            </div>
          </fieldset>
          {catalogue.length ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Features</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {catalogue.map((k) => (
                  <SelectField
                    key={k}
                    label={<code className="text-xs">{k}</code>}
                    name={planFeatureField(k)}
                    id={`pf-${k}`}
                    defaultValue={value.features[k] ?? "inherit"}
                    options={[
                      { value: "inherit", label: "Flag default" },
                      { value: "on", label: "Included" },
                      { value: "off", label: "Not included" },
                    ]}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}

export function DeletePlanButton({ id, name }: { id: string; name: string }) {
  return <ActionDialog action={deletePlanAction} fields={{ id }} title={`Delete plan “${name}”?`} description="Plans with stores on them can't be deleted — deactivate them instead." triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// ---- Feature flags -------------------------------------------------------------------

export function CreateFlagForm() {
  return (
    <ActionForm action={createFeatureFlagAction} submitLabel="Add flag" success="Flag created." resetOnSuccess>
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Key" name="key" required placeholder="e.g. storefront.reviews" errors={e.key} />
          <TextField label="Description" name="description" optional errors={e.description} />
          <CheckboxField label="On by default" name="defaultEnabled" />
        </div>
      )}
    </ActionForm>
  );
}

export function FlagRowControls({ flagKey, description, defaultEnabled }: { flagKey: string; description: string; defaultEnabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog action={updateFeatureFlagAction} fields={{ key: flagKey }} title={`Edit ${flagKey}`} triggerLabel="Edit" confirmLabel="Save" success="Saved.">
        {(e) => (
          <>
            <TextField label="Description" name="description" defaultValue={description} optional errors={e.description} />
            <CheckboxField label="On by default" name="defaultEnabled" defaultChecked={defaultEnabled} />
          </>
        )}
      </ActionDialog>
      <ActionDialog action={deleteFeatureFlagAction} fields={{ key: flagKey }} title={`Delete ${flagKey}?`} description="Store overrides and plan entries for this key stop applying." triggerLabel="Delete" confirmLabel="Delete" variant="danger" />
    </div>
  );
}

// ---- Platform users ------------------------------------------------------------------

export function AddPlatformUserForm() {
  return (
    <ActionForm action={addPlatformUserAction} submitLabel="Add user" success="User added." resetOnSuccess>
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email" name="email" type="email" required errors={e.email} hint="Must already have an account." />
          <SelectField label="Role" name="role" defaultValue="support" options={ROLE_OPTS} errors={e.role} />
        </div>
      )}
    </ActionForm>
  );
}

export function PlatformUserControls({ userId, role, status, self }: { userId: string; role: string; status: string; self: boolean }) {
  if (self) return <span className="text-xs text-muted">You</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog action={updatePlatformUserAction} fields={{ userId }} title="Edit platform user" triggerLabel="Edit" confirmLabel="Save" success="Saved.">
        {() => (
          <>
            <SelectField label="Role" name="role" defaultValue={role} options={ROLE_OPTS} />
            <SelectField label="Status" name="status" defaultValue={status} options={[{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }]} />
          </>
        )}
      </ActionDialog>
      <ActionDialog action={removePlatformUserAction} fields={{ userId }} title="Remove platform access?" description="They keep their account and any store memberships." triggerLabel="Remove" confirmLabel="Remove" variant="danger" />
    </div>
  );
}

// ---- Settings / domains --------------------------------------------------------------

export function PlatformSettingForm({ settingKey, label, description, kind, value }: { settingKey: string; label: string; description: string; kind: "boolean" | "text" | "email" | "number" | "textarea"; value: unknown }) {
  const str = value === null || value === undefined ? "" : String(value);
  return (
    <ActionForm action={updatePlatformSettingAction} fields={{ key: settingKey }} submitLabel="Save" submitVariant="secondary" className="space-y-3">
      {(e) =>
        kind === "boolean" ? (
          <CheckboxField label={label} name="value" defaultChecked={value === true} hint={description} />
        ) : kind === "textarea" ? (
          <TextAreaField label={label} name="value" defaultValue={str} rows={3} hint={description} errors={e.value ?? e._form} />
        ) : (
          <TextField label={label} name="value" type={kind === "email" ? "email" : kind === "number" ? "number" : "text"} defaultValue={str} hint={description} errors={e.value ?? e._form} />
        )
      }
    </ActionForm>
  );
}

export function RecheckDomainButton({ domainId }: { domainId: string }) {
  return <InlineAction action={recheckDomainAction} fields={{ domainId }} label="Re-check" success="Checked." />;
}
