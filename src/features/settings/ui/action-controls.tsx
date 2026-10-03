"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { Button, type ButtonProps } from "@/components/ui/button";
import { FormMessage, SubmitButton, fieldErrors } from "@/components/ui/form";

/**
 * Shared dashboard action controls (seller ops features). Unlike ConfirmButton these
 * surface the action's error message (and field errors) to the user.
 */

// `any` for the previous-state parameter so actions typed ActionResult<void> / ActionResult<X> are all accepted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormAction<T = unknown> = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<T>>;

export function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/**
 * Button that opens a native <dialog> (focus trap + Esc) with a form. Extra inputs go in
 * `children`; pass a function to receive field errors. Closes and announces `success` on success.
 */
export function ActionDialog({
  action,
  fields = {},
  title,
  description,
  triggerLabel,
  confirmLabel = "Confirm",
  variant = "primary",
  triggerVariant,
  size = "sm",
  children,
  disabled,
  success,
}: {
  action: FormAction;
  fields?: Record<string, string>;
  title: string;
  description?: ReactNode;
  triggerLabel: ReactNode;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  triggerVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  children?: ReactNode | ((errors: Record<string, string[]>) => ReactNode);
  disabled?: boolean;
  success?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, null);
  // Success is derived from the action state (no extra state), announced via aria-live.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const announce = Boolean(state?.ok) && state !== dismissed;
  useEffect(() => {
    if (state?.ok) {
      ref.current?.close();
      formRef.current?.reset();
    }
  }, [state]);
  const errors = fieldErrors(state);
  return (
    <>
      <span className="inline-flex flex-col items-start gap-1">
        <Button
          variant={triggerVariant ?? (variant === "danger" ? "secondary" : variant)}
          size={size}
          disabled={disabled}
          onClick={() => {
            setDismissed(state);
            ref.current?.showModal();
          }}
        >
          {triggerLabel}
        </Button>
        {announce && success ? (
          <span role="status" className="text-xs text-success">
            {success}
          </span>
        ) : null}
      </span>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[min(92vw,480px)] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/40">
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <HiddenFields fields={fields} />
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? <div className="mt-2 text-sm text-muted">{description}</div> : null}
          </div>
          {state && !state.ok ? <FormMessage state={state} /> : null}
          {typeof children === "function" ? children(errors) : children}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <SubmitButton variant={variant}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Single-button form (e.g. "Approve") with inline error/success feedback. */
export function InlineAction({
  action,
  fields = {},
  label,
  variant = "secondary",
  size = "sm",
  success,
  className,
}: {
  action: FormAction;
  fields?: Record<string, string>;
  label: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  success?: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "inline-flex flex-col items-start gap-1"}>
      <HiddenFields fields={fields} />
      <SubmitButton variant={variant} size={size}>
        {label}
      </SubmitButton>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-error">
          {state.error.fieldErrors?._form?.[0] ?? Object.values(state.error.fieldErrors ?? {})[0]?.[0] ?? state.error.message}
        </span>
      ) : state?.ok && success ? (
        <span role="status" className="text-xs text-success">
          {success}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Inline form with a success banner and field errors. `children` receives field errors.
 * `resetOnSuccess` clears inputs after a successful create.
 */
export function ActionForm({
  action,
  fields = {},
  submitLabel = "Save",
  success = "Saved.",
  children,
  resetOnSuccess = false,
  className,
  submitVariant = "primary",
  encType,
}: {
  action: FormAction;
  fields?: Record<string, string>;
  submitLabel?: ReactNode;
  success?: ReactNode;
  children: (errors: Record<string, string[]>) => ReactNode;
  resetOnSuccess?: boolean;
  className?: string;
  submitVariant?: ButtonProps["variant"];
  encType?: "multipart/form-data";
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={formRef} action={formAction} encType={encType} className={className ?? "space-y-4"}>
      <HiddenFields fields={fields} />
      <FormMessage state={state} success={success} />
      {children(fieldErrors(state))}
      <div>
        <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
