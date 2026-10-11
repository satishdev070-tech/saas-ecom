"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { HiddenFields } from "@/features/settings/ui/action-controls";
import type { ActionResult } from "@/lib/actions/result";
import { adminCreateStoreAction, loginAsStoreAction, sendResetLinkAction, setMemberPasswordAction } from "../store-admin-actions";

type Opt = { value: string; label: string };
export type ThemeOpt = { key: string; name: string; industry: string; style: string };

// ---- Create store -----------------------------------------------------------------------

export function AdminCreateStoreForm({ plans, industries, themes, superAdmin, rootDomain }: { plans: Opt[]; industries: Opt[]; themes: ThemeOpt[]; superAdmin: boolean; rootDomain: string }) {
  const [state, action] = useActionState(adminCreateStoreAction, null);
  const e = fieldErrors(state);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [status, setStatus] = useState("trial");
  const [category, setCategory] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const themeOpts = useMemo(() => {
    const list = category ? themes.filter((t) => t.industry === category) : themes;
    return [{ value: "", label: "Default theme" }, ...list.map((t) => ({ value: t.key, label: `${t.name} · ${t.style}` }))];
  }, [category, themes]);

  const section = "rounded-lg border border-border p-4 space-y-4";
  const h = "text-sm font-semibold";
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />

      <fieldset className={section}>
        <legend className={h}>1. Owner</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="ownerMode" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing account
          </label>
          <label className={`inline-flex items-center gap-2 ${superAdmin ? "" : "opacity-50"}`}>
            <input type="radio" name="ownerMode" value="new" checked={mode === "new"} disabled={!superAdmin} onChange={() => setMode("new")} /> Create a new account
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Owner email" name="ownerEmail" type="email" required autoComplete="off" errors={e.ownerEmail} hint={mode === "existing" ? "Must already have an account." : "A confirmed account is created with this email."} />
          {mode === "new" ? (
            <>
              <TextField label="Owner name" name="ownerName" maxLength={120} errors={e.ownerName} />
              <TextField label="Password" name="ownerPassword" type="password" autoComplete="new-password" optional errors={e.ownerPassword} hint="Leave blank to email the owner a link to set their own password (recommended)." />
            </>
          ) : null}
        </div>
        {e.ownerMode ? <p className="text-xs text-error">{e.ownerMode[0]}</p> : null}
      </fieldset>

      <fieldset className={section}>
        <legend className={h}>2. Store</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Store name"
            name="name"
            required
            maxLength={120}
            errors={e.name}
            onChange={(ev) => {
              if (!slugTouched) setSlug(ev.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63));
            }}
          />
          <TextField
            label="Store address (slug)"
            name="slug"
            required
            pattern="[a-z0-9-]{3,63}"
            value={slug}
            onChange={(ev) => {
              setSlugTouched(true);
              setSlug(ev.target.value.toLowerCase());
            }}
            errors={e.slug}
            hint={slug ? `${slug}.${rootDomain}` : "Lowercase letters, numbers and hyphens."}
          />
          <SelectField label="Industry" name="category" value={category} onChange={(ev) => setCategory(ev.target.value)} options={[{ value: "", label: "Not set" }, ...industries]} errors={e.category} />
          <SelectField label="Store type" name="storeType" defaultValue="real" options={[{ value: "real", label: "Real seller" }, { value: "demo", label: "Demo / showcase" }, { value: "test", label: "Internal test" }]} errors={e.storeType} />
          <TextField label="Store contact email" name="storeEmail" type="email" optional errors={e.storeEmail} hint="Shown to shoppers; order alerts go here." />
          <TextField label="Store phone" name="storePhone" type="tel" optional errors={e.storePhone} />
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={h}>3. Plan &amp; status</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Plan" name="planId" defaultValue="" options={[{ value: "", label: "Default plan" }, ...plans]} errors={e.planId} />
          <SelectField label="Status" name="status" value={status} onChange={(ev) => setStatus(ev.target.value)} options={[{ value: "trial", label: "Trial" }, { value: "active", label: "Active (paid)" }]} errors={e.status} />
          {status === "trial" ? <TextField label="Trial length (days)" name="trialDays" type="number" min={1} max={365} optional placeholder="Plan default" errors={e.trialDays} /> : null}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className={h}>4. Theme &amp; launch</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Theme" name="themeKey" defaultValue="" options={themeOpts} errors={e.themeKey} hint={category ? "Themes for the chosen industry." : "Choose an industry to narrow the list."} />
          <SelectField
            label="Storefront"
            name="launch"
            defaultValue="draft"
            options={[
              { value: "draft", label: "Coming soon (owner publishes)" },
              { value: "live", label: "Live now" },
            ]}
            errors={e.launch}
          />
        </div>
        <CheckboxField label="Publish the theme now" name="publishTheme" defaultChecked hint="Otherwise it's saved as a draft for the owner to review." />
      </fieldset>

      <CheckboxField label="Email the owner" name="notifyOwner" defaultChecked hint="New accounts get a link to set their password; existing owners get a link to their dashboard. Sent through Resend." />

      <SubmitButton>Create store</SubmitButton>
    </form>
  );
}

// ---- Account access (per member) --------------------------------------------------------------

function Dialog({ title, trigger, triggerVariant = "secondary", children }: { title: string; trigger: string; triggerVariant?: "secondary" | "ghost" | "primary" | "danger"; children: (close: () => void) => React.ReactNode }) {
  const id = useId();
  const dialogId = `${id}-dialog`;
  const el = () => document.getElementById(dialogId) as HTMLDialogElement | null;
  const close = () => el()?.close();
  return (
    <>
      <Button size="sm" variant={triggerVariant} onClick={() => el()?.showModal()}>
        {trigger}
      </Button>
      <dialog id={dialogId} aria-labelledby={id} className="m-auto w-[min(92vw,500px)] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/40">
        <div className="space-y-4 p-5">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          {children(close)}
        </div>
      </dialog>
    </>
  );
}

function ResetLinkBody({ tenantId, userId, email, close }: { tenantId: string; userId: string; email: string; close: () => void }) {
  const [state, action] = useActionState(sendResetLinkAction, null);
  const [copied, setCopied] = useState(false);
  if (state?.ok) {
    const d = state.data;
    return (
      <div className="space-y-3 text-sm">
        <p role="status" className={d.emailStatus === "sent" ? "text-success" : "text-warning"}>
          {d.emailStatus === "sent" ? `Reset email sent to ${d.email}.` : d.emailStatus === "logged" ? "Email is not configured (Admin → Email), so nothing was sent. Share the link below securely." : "The email couldn't be sent. Share the link below securely."}
        </p>
        <div>
          <p className="mb-1 text-muted">One-time reset link (expires soon; works once):</p>
          <div className="flex gap-2">
            <input readOnly value={d.link} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-secondary px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Reset link" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(d.link).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={close}>
            Done
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <HiddenFields fields={{ tenantId, userId }} />
      <p className="text-sm text-muted">Emails {email} a one-time link to choose a new password. Their current password keeps working until they change it.</p>
      <FormMessage state={state} />
      <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={2} errors={fieldErrors(state).reason} hint="Recorded in the audit log." />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <SubmitButton>Send reset link</SubmitButton>
      </div>
    </form>
  );
}

function SetPasswordBody({ tenantId, userId, email, close }: { tenantId: string; userId: string; email: string; close: () => void }) {
  const [state, action] = useActionState(setMemberPasswordAction, null as ActionResult<{ email: string }> | null);
  const e = fieldErrors(state);
  if (state?.ok) {
    return (
      <div className="space-y-3 text-sm">
        <p role="status" className="text-success">
          New password set for {state.data.email}. Share it with them over a secure channel and ask them to change it after signing in.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={close}>
            Done
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" autoComplete="off">
      <HiddenFields fields={{ tenantId, userId }} />
      <p className="text-sm text-muted">Replaces the password for {email} immediately. Prefer “Send reset link” unless they can&apos;t receive email.</p>
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="New password" name="password" type="password" autoComplete="new-password" required errors={e.password} hint="10+ chars, upper & lower case, a number." />
        <TextField label="Confirm" name="confirm" type="password" autoComplete="new-password" required errors={e.confirm} />
      </div>
      <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={2} errors={e.reason} hint="Recorded in the audit log." />
      <CheckboxField label="Email them that their password was changed" name="notify" defaultChecked hint="The password itself is never emailed." />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="danger">Set password</SubmitButton>
      </div>
    </form>
  );
}

function LoginAsBody({ tenantId, userId, email, close }: { tenantId: string; userId?: string; email: string; close: () => void }) {
  const [state, action] = useActionState(loginAsStoreAction, null);
  return (
    <form action={action} className="space-y-4">
      <HiddenFields fields={{ tenantId, ...(userId ? { userId } : {}) }} />
      <div className="space-y-2 text-sm text-muted">
        <p>
          You&apos;ll be signed in as <span className="font-medium text-foreground">{email}</span> and taken to this store&apos;s dashboard with their full access. Everything you do is recorded under their account and this sign-in is audited.
        </p>
        <p>Your own console session in this browser ends. Use “End support sign-in” in the dashboard banner to return.</p>
      </div>
      <FormMessage state={state} />
      <TextAreaField label="Reason" name="reason" required minLength={10} maxLength={500} rows={2} errors={fieldErrors(state).reason} hint="e.g. ticket number and what the seller asked for." />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <SubmitButton variant="danger">Sign in as store</SubmitButton>
      </div>
    </form>
  );
}

/** Actions on one store member (Team card). */
export function MemberAccessActions({ tenantId, userId, email, superAdmin, canManage }: { tenantId: string; userId: string; email: string; superAdmin: boolean; canManage: boolean }) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog title="Send a password reset link" trigger="Reset password">
        {(close) => <ResetLinkBody tenantId={tenantId} userId={userId} email={email} close={close} />}
      </Dialog>
      {superAdmin ? (
        <>
          <Dialog title="Set a new password" trigger="Set password" triggerVariant="ghost">
            {(close) => <SetPasswordBody tenantId={tenantId} userId={userId} email={email} close={close} />}
          </Dialog>
          <Dialog title="Sign in as this member" trigger="Sign in as" triggerVariant="ghost">
            {(close) => <LoginAsBody tenantId={tenantId} userId={userId} email={email} close={close} />}
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

/** Header button: sign in as the store owner. */
export function LoginAsStoreButton({ tenantId, ownerEmail }: { tenantId: string; ownerEmail: string }) {
  return (
    <Dialog title="Log in to this store" trigger="Log in as store" triggerVariant="primary">
      {(close) => <LoginAsBody tenantId={tenantId} email={ownerEmail} close={close} />}
    </Dialog>
  );
}
