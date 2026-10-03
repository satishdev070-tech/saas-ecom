"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Minimal accessible dropdown: button toggles a panel; Esc and outside click close it and
 * focus returns to the trigger. Content is ordinary links/buttons (tab-navigable).
 */
export function Popover({ trigger, label, children, align = "end", className }: { trigger: ReactNode; label: string; children: ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-md px-1.5 text-muted transition-colors hover:bg-surface-secondary hover:text-foreground aria-expanded:bg-surface-secondary"
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={id}
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
          className={cn(
            "absolute top-full z-40 mt-2 w-72 origin-top rounded-lg border border-border bg-surface-elevated p-1.5 text-foreground shadow-lg animate-[pop-in_140ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PopoverItem({ href, children, external, onClick }: { href?: string; children: ReactNode; external?: boolean; onClick?: () => void }) {
  const cls = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-small text-foreground hover:bg-surface-secondary [&_svg]:size-4 [&_svg]:text-muted";
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
