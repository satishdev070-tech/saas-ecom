"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

/**
 * Accessible confirmation using the native <dialog> element (focus trapping + Esc for free).
 * Renders a trigger button; on confirm, submits the given server action via a hidden form.
 */
export function ConfirmButton({
  action,
  fields = {},
  title,
  description,
  confirmLabel = "Confirm",
  children,
  variant = "danger",
  size = "sm",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Button variant={variant === "danger" ? "secondary" : variant} size={size} onClick={() => ref.current?.showModal()}>
        {children}
      </Button>
      <dialog ref={ref} className="m-auto w-[min(92vw,420px)] rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-black/40">
        <form
          action={async (fd) => {
            setPending(true);
            try {
              await action(fd);
            } finally {
              setPending(false);
              ref.current?.close();
            }
          }}
          className="p-5"
        >
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <div className="mt-2 text-sm text-muted">{description}</div> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant={variant} pending={pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
