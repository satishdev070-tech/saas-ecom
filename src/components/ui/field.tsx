import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-foreground shadow-xs placeholder:text-subtle transition-colors " +
  "hover:border-border-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-70 " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:focus:ring-error/15";

export function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-label text-foreground">
      {children}
      {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
    </label>
  );
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-small text-error">
      {messages[0]}
    </p>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-caption text-muted">{children}</p>;
}

type FieldBase = { label: ReactNode; name: string; errors?: string[]; hint?: ReactNode; optional?: boolean };

/** Text input with label, hint and error wiring (aria-invalid + aria-describedby). */
export function TextField({ label, name, errors, hint, optional, className, id, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? `f-${name}`;
  const errId = `${inputId}-error`;
  return (
    <div className={className}>
      <Label htmlFor={inputId} optional={optional}>
        {label}
      </Label>
      <input id={inputId} name={name} aria-invalid={errors?.length ? true : undefined} aria-describedby={errors?.length ? errId : undefined} className={control} {...rest} />
      {hint ? <Hint>{hint}</Hint> : null}
      <FieldError id={errId} messages={errors} />
    </div>
  );
}

export function TextAreaField({ label, name, errors, hint, optional, className, id, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputId = id ?? `f-${name}`;
  const errId = `${inputId}-error`;
  return (
    <div className={className}>
      <Label htmlFor={inputId} optional={optional}>
        {label}
      </Label>
      <textarea id={inputId} name={name} rows={rest.rows ?? 4} aria-invalid={errors?.length ? true : undefined} aria-describedby={errors?.length ? errId : undefined} className={control} {...rest} />
      {hint ? <Hint>{hint}</Hint> : null}
      <FieldError id={errId} messages={errors} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  optional,
  className,
  id,
  options,
  ...rest
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const inputId = id ?? `f-${name}`;
  const errId = `${inputId}-error`;
  return (
    <div className={className}>
      <Label htmlFor={inputId} optional={optional}>
        {label}
      </Label>
      <select id={inputId} name={name} aria-invalid={errors?.length ? true : undefined} aria-describedby={errors?.length ? errId : undefined} className={control} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <Hint>{hint}</Hint> : null}
      <FieldError id={errId} messages={errors} />
    </div>
  );
}

export function CheckboxField({ label, name, hint, className, id, ...rest }: Omit<FieldBase, "errors" | "optional"> & InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? `f-${name}`;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <input id={inputId} type="checkbox" name={name} className="mt-0.5 size-4 rounded border-border accent-[var(--accent)]" {...rest} />
      <div>
        <label htmlFor={inputId} className="text-label">
          {label}
        </label>
        {hint ? <Hint>{hint}</Hint> : null}
      </div>
    </div>
  );
}

export const inputClassName = control;
