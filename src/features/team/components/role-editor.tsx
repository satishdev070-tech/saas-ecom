"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Search } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { PERMISSION_GROUPS } from "@/lib/permissions/labels";
import { cn } from "@/lib/cn";
import { saveCustomRoleAction } from "../actions";

type Props = {
  role?: { id: string; name: string; description: string | null; permissions: string[] };
  /** Permissions the editor may grant (the current member's own, minus owner-only). */
  grantable: string[];
};

/** Create/edit a custom role. The server and a DB trigger re-check that nothing is escalated. */
export function RoleEditor({ role, grantable }: Props) {
  const [state, action] = useActionState(saveCustomRoleAction, null);
  const errors = fieldErrors(state);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? ["store.read"]));
  const [q, setQ] = useState("");
  const can = useMemo(() => new Set(grantable), [grantable]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return PERMISSION_GROUPS.map((g) => ({
      ...g,
      permissions: g.permissions.filter((p) => p.key !== "billing.manage" && (!t || `${p.label} ${p.description} ${g.label}`.toLowerCase().includes(t))),
    })).filter((g) => g.permissions.length);
  }, [q]);

  const set = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (!can.has(k)) continue;
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  const allKeys = groups.flatMap((g) => g.permissions.map((p) => p.key));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" noValidate>
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      {[...selected].map((p) => (
        <input key={p} type="hidden" name="permissions" value={p} />
      ))}

      <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <FormMessage state={state} />
        <TextField label="Role name" name="name" defaultValue={role?.name} placeholder="e.g. Photo editor" required maxLength={60} errors={errors.name} />
        <TextAreaField label="Description" name="description" defaultValue={role?.description ?? ""} rows={3} maxLength={240} optional hint="Shown to whoever assigns this role." errors={errors.description} />
        <div className="rounded-lg border border-border bg-surface-secondary/60 p-4">
          <p className="text-h4">{selected.size} permissions selected</p>
          <p className="mt-1 text-caption text-muted">Members with this role can only do what&apos;s ticked. Changes apply the next time they load a page.</p>
          {errors.permissions ? <p className="mt-2 text-small text-error">{errors.permissions[0]}</p> : null}
        </div>
        <div className="flex gap-2">
          <SubmitButton>{role ? "Save role" : "Create role"}</SubmitButton>
          <Link href="/dashboard/settings/roles" className={buttonClass({ variant: "secondary" })}>
            Cancel
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <label htmlFor="perm-search" className="sr-only">
              Search permissions
            </label>
            <input
              id="perm-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search permissions"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-small outline-none focus:border-accent focus:ring-3 focus:ring-accent/15"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => set(allKeys, true)}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => set(allKeys, false)}>
            Clear all
          </Button>
        </div>
        {groups.length ? (
          <div className="divide-y divide-border">
            {groups.map((g) => {
              const keys = g.permissions.map((p) => p.key);
              const on = keys.filter((k) => selected.has(k)).length;
              return (
                <fieldset key={g.key} className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <legend className="text-h3">
                      {g.label} <span className="ml-1 text-caption font-normal text-muted">{on}/{keys.length}</span>
                    </legend>
                    <button type="button" onClick={() => set(keys, on < keys.length)} className="text-small font-medium text-accent hover:underline">
                      {on < keys.length ? "Select group" : "Clear group"}
                    </button>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {g.permissions.map((p) => {
                      const allowed = can.has(p.key);
                      const checked = selected.has(p.key);
                      return (
                        <li key={p.key}>
                          <label
                            className={cn(
                              "flex h-full cursor-pointer gap-3 rounded-md border p-3 transition-colors",
                              checked ? "border-accent/50 bg-accent-soft/60" : "border-border hover:border-border-strong",
                              !allowed && "cursor-not-allowed opacity-55",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!allowed}
                              onChange={(e) => set([p.key], e.target.checked)}
                              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-label">
                                {p.label}
                                {!allowed ? <Lock aria-label="You don't have this permission" className="size-3.5 text-subtle" /> : null}
                              </span>
                              <span className="mt-0.5 block text-caption text-muted">{p.description}</span>
                              <code className="mt-1 block text-[11px] text-subtle">{p.key}</code>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        ) : (
          <p className="p-8 text-center text-small text-muted">No permissions match “{q}”.</p>
        )}
      </div>
    </form>
  );
}
