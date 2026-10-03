"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share: the device share sheet where available (phones), otherwise a small menu with
 * WhatsApp, Facebook, X, Pinterest, email and copy link. Uses the page's canonical URL.
 */
export function ShareButton({ title, url, image }: { title: string; url: string; image?: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, color: "#25d366" },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, color: "#1877f2" },
    { label: "X", href: `https://x.com/intent/post?url=${u}&text=${t}`, color: "#111111" },
    { label: "Pinterest", href: `https://www.pinterest.com/pin/create/button/?url=${u}&description=${t}${image ? `&media=${encodeURIComponent(image)}` : ""}`, color: "#e60023" },
    { label: "Email", href: `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n${url}`)}`, color: "#6b7280" },
  ];

  const onClick = async () => {
    if (typeof navigator !== "undefined" && navigator.share && window.matchMedia?.("(hover: none)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // cancelled: fall through to the menu
      }
    }
    setOpen((v) => !v);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div ref={box} className="relative inline-block">
      <button type="button" onClick={onClick} aria-expanded={open} aria-haspopup="menu" className="sf-pdp-action">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        Share
      </button>
      {open ? (
        <div role="menu" className="sf-share-menu">
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] opacity-60">Share this product</p>
          {links.map((l) => (
            <a key={l.label} role="menuitem" href={l.href} target="_blank" rel="noopener noreferrer" className="sf-share-item" onClick={() => setOpen(false)}>
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </a>
          ))}
          <button type="button" role="menuitem" onClick={copy} className="sf-share-item w-full text-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
