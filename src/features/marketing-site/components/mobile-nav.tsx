"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonClass } from "./ui";
import type { NavLink } from "../content";

/**
 * Mobile menu (below lg). A disclosure button controls a panel: Escape or a link closes it and
 * focus returns to the button; the page behind stops scrolling while it's open.
 */
export function MobileNav({ links, loginHref, signupHref, ctaLabel }: { links: NavLink[]; loginHref: string; signupHref: string; ctaLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-full text-brand-ink hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      <div id={panelId} hidden={!open} className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-white">
        <nav aria-label="Main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <ul className="space-y-1">
            {links.map((l, i) => (
              <li key={l.href}>
                <Link
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className="block rounded-brand-md px-3 py-3 text-lg font-semibold text-brand-ink hover:bg-brand-canvas aria-[current=page]:text-brand"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3 border-t border-border pt-6">
            <Link href={signupHref} onClick={() => setOpen(false)} className={buttonClass("primary", "lg")}>
              {ctaLabel}
            </Link>
            <Link href={loginHref} onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
              Login
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
