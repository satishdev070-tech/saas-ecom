"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";
import { addDomainAction, removeDomainAction, setPrimaryDomainAction, verifyDomainAction } from "../actions";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-background focus-visible:outline-2"
      aria-label={`Copy ${label}`}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function AddDomainForm({ apexSupported = false }: { apexSupported?: boolean }) {
  const [state, action] = useActionState(addDomainAction, null);
  const errors = fieldErrors(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-3" noValidate>
      <FormMessage state={state} success={state?.ok ? `${state.data.hostname} added. Add the DNS records below, then verify.` : null} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          className="flex-1"
          label="Domain"
          name="hostname"
          placeholder="www.yourbrand.in"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          errors={errors.hostname}
          hint={
            apexSupported
              ? "Enter yourbrand.in or www.yourbrand.in. We connect the other one too and redirect it to the one you enter."
              : "Use a subdomain such as www. Root domains (yourbrand.in) usually can't use a CNAME record."
          }
        />
        <SubmitButton className="sm:mt-6">Add domain</SubmitButton>
      </div>
    </form>
  );
}

export function VerifyDomainButton({ domainId }: { domainId: string }) {
  const [state, action] = useActionState(verifyDomainAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="domainId" value={domainId} />
      <SubmitButton size="sm" variant="secondary">
        Check now
      </SubmitButton>
      {state ? (
        state.ok ? (
          <p role="status" className={state.data.verified ? "text-sm text-success" : "text-sm text-muted"}>
            {state.data.verified ? (state.data.message ?? "Verified.") : (state.data.message ?? "Not verified yet.")}
          </p>
        ) : (
          <FormMessage state={state} />
        )
      ) : null}
    </form>
  );
}

export function SetPrimaryButton({ domainId }: { domainId: string }) {
  const [state, action] = useActionState(setPrimaryDomainAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="domainId" value={domainId} />
      <SubmitButton size="sm" variant="secondary">
        Make primary
      </SubmitButton>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function RemoveDomainButton({ domainId, hostname }: { domainId: string; hostname: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(removeDomainAction, null);
  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => ref.current?.showModal()}>
        Remove
      </Button>
      <dialog ref={ref} aria-labelledby={`rm-${domainId}`} className="m-auto w-[min(92vw,440px)] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/40">
        <form action={action} className="space-y-3 p-5">
          <input type="hidden" name="domainId" value={domainId} />
          <h2 id={`rm-${domainId}`} className="text-base font-semibold">
            Remove {hostname}?
          </h2>
          <p className="text-sm text-muted">
            Shoppers visiting this domain will see a “not found” page. Your store stays available on its platform address. You can add the domain again later.
          </p>
          <FormMessage state={state && !state.ok ? state : null} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <SubmitButton variant="danger">Remove domain</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
