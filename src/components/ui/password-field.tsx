"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FieldError, Hint, Label, inputClassName } from "./field";

/** Password input with a show/hide toggle (keeps label/error/hint wiring of TextField). */
export function PasswordField({
  label,
  name,
  errors,
  hint,
  className,
  id,
  labelAside,
  ...rest
}: { label: ReactNode; name: string; errors?: string[]; hint?: ReactNode; labelAside?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  const inputId = id ?? `f-${name}`;
  const errId = `${inputId}-error`;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={inputId}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={shown ? "text" : "password"}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? errId : undefined}
          className={`${inputClassName} pr-10`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-subtle hover:text-foreground"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {hint ? <Hint>{hint}</Hint> : null}
      <FieldError id={errId} messages={errors} />
    </div>
  );
}
