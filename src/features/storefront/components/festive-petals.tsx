"use client";

import { useEffect, useState } from "react";

const MULTI = ["#ff3d7f", "#2ec4b6", "#ffbe0b", "#8338ec", "#ff9933"];

/**
 * A few petals drifting down over the page for a festive campaign. Purely decorative: pointer
 * events off, hidden from assistive tech, not rendered for prefers-reduced-motion, and it stops
 * after one pass (~12 s) so it never distracts while shopping.
 */
export function FestivePetals({ color }: { color: string }) {
  const [petals, setPetals] = useState<{ left: number; delay: number; size: number; dur: number; color: string }[]>([]);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => {
      setPetals(
        Array.from({ length: 18 }, (_, i) => ({
          left: Math.random() * 100,
          delay: Math.random() * 4,
          size: 8 + Math.random() * 8,
          dur: 7 + Math.random() * 5,
          color: color === "multi" ? MULTI[i % MULTI.length]! : color,
        })),
      );
    }, 600);
    return () => window.clearTimeout(t);
  }, [color]);
  if (!petals.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {petals.map((p, i) => (
        <span
          key={i}
          className="sf-festive-petal absolute -top-6 block rounded-[60%_0_60%_0]"
          style={{ left: `${p.left}%`, width: p.size, height: p.size, background: p.color, opacity: 0.85, animation: `sf-festive-fall ${p.dur}s linear ${p.delay}s 1 forwards` }}
        />
      ))}
    </div>
  );
}
