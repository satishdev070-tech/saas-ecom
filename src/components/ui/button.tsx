import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/** Shared with link-styled buttons (<Link className={buttonClass(...)}>). */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  accent: "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90",
  secondary: "border border-border bg-surface text-foreground shadow-xs hover:bg-surface-secondary",
  outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-secondary",
  ghost: "text-foreground hover:bg-surface-secondary",
  danger: "bg-error text-white shadow-xs hover:bg-error/90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-small",
  md: "h-9 px-3.5 text-small",
  lg: "h-10 px-4 text-body",
};

export function buttonClass({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a busy state and disables the button (e.g. while a server action runs). */
  pending?: boolean;
};

export function Button({ variant = "primary", size = "md", pending = false, className, disabled, children, type, ...rest }: ButtonProps) {
  return (
    <button type={type ?? "button"} disabled={disabled || pending} aria-busy={pending || undefined} className={buttonClass({ variant, size, className })} {...rest}>
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
      {children}
    </button>
  );
}
