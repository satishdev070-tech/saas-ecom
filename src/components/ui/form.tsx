"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { Button, type ButtonProps } from "./button";

/** Submit button that shows pending state from the enclosing <form>. */
export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} {...props}>
      {children}
    </Button>
  );
}

/** Form-level success / error banner for a useActionState result. */
export function FormMessage({ state, success }: { state: ActionResult<unknown> | null; success?: ReactNode }) {
  if (!state) return null;
  if (state.ok) {
    return success ? (
      <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">
        {success}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">
      {state.error.fieldErrors?._form?.[0] ?? state.error.message}
    </p>
  );
}

/** Field errors from a failed ActionResult (empty object otherwise). */
export function fieldErrors(state: ActionResult<unknown> | null): Record<string, string[]> {
  return state && !state.ok ? (state.error.fieldErrors ?? {}) : {};
}
