"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Check, Copy, MailPlus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, inputClassName } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { ActionDialog } from "@/features/settings/ui/action-controls";
import { changeMemberRoleAction, inviteMemberAction, removeMemberAction, resendInvitationAction, revokeInvitationAction, setMemberStatusAction } from "../actions";

export type RoleOption = { value: string; label: string; description: string; disabled?: boolean; group: "Standard roles" | "Custom roles" };

function RoleSelect({ id, name, options, defaultValue, onChange }: { id: string; name: string; options: RoleOption[]; defaultValue?: string; onChange?: (v: string) => void }) {
  const groups = ["Standard roles", "Custom roles"] as const;
  return (
    <select id={id} name={name} defaultValue={defaultValue} onChange={(e) => onChange?.(e.target.value)} className={inputClassName}>
      {groups.map((g) => {
        const list = options.filter((o) => o.group === g);
        return list.length ? (
          <optgroup key={g} label={g}>
            {list.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
                {o.disabled ? " (needs permissions you don't have)" : ""}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-secondary p-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate text-caption">{link}</code>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** "Invite member" button + dialog. Shows the invite link after success (handy when email isn't configured). */
export function InviteMemberDialog({ roles }: { roles: RoleOption[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, action] = useActionState(inviteMemberAction, null);
  const firstEnabled = roles.find((r) => !r.disabled)?.value;
  const [selected, setSelected] = useState(firstEnabled ?? "");
  const errors = fieldErrors(state);
  const info = roles.find((r) => r.value === selected);
  return (
    <>
      <Button onClick={() => ref.current?.showModal()}>
        <MailPlus aria-hidden /> Invite member
      </Button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[min(94vw,480px)] rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/40">
        {state?.ok ? (
          <div className="space-y-4 p-6">
            <h2 id={titleId} className="text-h2">
              Invitation sent
            </h2>
            <p className="text-body text-muted">We emailed the invitation. You can also share this link directly; it works once and expires in 7 days.</p>
            <CopyLink link={state.data.link} />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => ref.current?.close()}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-5 p-6">
            <div>
              <h2 id={titleId} className="text-h2">
                Invite a team member
              </h2>
              <p className="mt-1 text-body text-muted">They&apos;ll get an email to join this store with the role you choose.</p>
            </div>
            <FormMessage state={state} />
            <TextField label="Email" name="email" type="email" autoComplete="off" placeholder="name@yourbrand.in" required errors={errors.email} />
            <div>
              <label htmlFor="invite-role" className="mb-1.5 block text-label">
                Role
              </label>
              <RoleSelect id="invite-role" name="role" options={roles} defaultValue={firstEnabled} onChange={setSelected} />
              {info ? <p className="mt-1.5 text-caption text-muted">{info.description}</p> : null}
              {errors.role ? <p className="mt-1.5 text-small text-error">{errors.role[0]}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => ref.current?.close()}>
                Cancel
              </Button>
              <SubmitButton>Send invitation</SubmitButton>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

/** Inline role picker for a member; the save button appears once the role changes. */
export function MemberRoleForm({ membershipId, current, roles }: { membershipId: string; current: string; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState(changeMemberRoleAction, null);
  const [value, setValue] = useState(current);
  const id = useId();
  return (
    <form action={action} className="flex min-w-52 items-center gap-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <label htmlFor={id} className="sr-only">
        Role
      </label>
      <RoleSelect id={id} name="role" options={roles} defaultValue={current} onChange={setValue} />
      {value !== current ? (
        <Button type="submit" size="sm" pending={pending}>
          Save
        </Button>
      ) : null}
      {state && !state.ok ? (
        <span role="alert" className="text-caption text-error">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}

export function MemberActions({ membershipId, name, status }: { membershipId: string; name: string; status: "active" | "disabled" }) {
  return (
    <div className="flex justify-end gap-1.5">
      {status === "active" ? (
        <ActionDialog
          action={setMemberStatusAction}
          fields={{ membershipId, status: "disabled" }}
          title={`Deactivate ${name}?`}
          description="They lose access to this store immediately. Their account and history are kept, and you can reactivate them later."
          triggerLabel="Deactivate"
          confirmLabel="Deactivate"
          variant="danger"
        />
      ) : (
        <ActionDialog action={setMemberStatusAction} fields={{ membershipId, status: "active" }} title={`Reactivate ${name}?`} description="They regain access with their current role." triggerLabel="Reactivate" confirmLabel="Reactivate" />
      )}
      <ActionDialog
        action={removeMemberAction}
        fields={{ membershipId }}
        title={`Remove ${name} from the team?`}
        description="They lose access immediately. To give access again you'll need to send a new invitation."
        triggerLabel="Remove"
        confirmLabel="Remove member"
        variant="danger"
        triggerVariant="ghost"
      />
    </div>
  );
}

export function InviteActions({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState(resendInvitationAction, null);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="secondary" pending={pending}>
          {state?.ok ? <Check aria-hidden /> : <RotateCw aria-hidden />} {state?.ok ? "Sent" : "Resend"}
        </Button>
      </form>
      <ActionDialog action={revokeInvitationAction} fields={{ id }} title="Revoke this invitation?" description={`The link sent to ${email} will stop working.`} triggerLabel="Revoke" confirmLabel="Revoke" variant="danger" triggerVariant="ghost" />
    </div>
  );
}
