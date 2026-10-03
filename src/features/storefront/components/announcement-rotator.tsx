"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** One announcement at a time with prev/next arrows; auto-advances every 5 s, pauses on hover/focus. */
export function AnnouncementRotator({ messages }: { messages: { text: string; href: string }[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || messages.length < 2) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % messages.length), 5000);
    return () => window.clearInterval(t);
  }, [paused, messages.length]);
  const m = messages[i] ?? messages[0];
  if (!m) return null;
  const go = (d: number) => setI((x) => (x + d + messages.length) % messages.length);
  return (
    <div className="flex items-center justify-between gap-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {messages.length > 1 ? (
        <button type="button" onClick={() => go(-1)} className="px-2 opacity-80 hover:opacity-100" aria-label="Previous announcement">
          ‹
        </button>
      ) : (
        <span />
      )}
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-center">
        {m.href ? (
          <Link href={m.href} className="underline-offset-2 hover:underline">
            {m.text}
          </Link>
        ) : (
          m.text
        )}
      </p>
      {messages.length > 1 ? (
        <button type="button" onClick={() => go(1)} className="px-2 opacity-80 hover:opacity-100" aria-label="Next announcement">
          ›
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
