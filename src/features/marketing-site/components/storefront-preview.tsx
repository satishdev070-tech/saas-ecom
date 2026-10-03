"use client";

import { useState, type CSSProperties } from "react";
import { DEMO_PRODUCTS, DEMO_STORE } from "../content";
import { THEME_LOOKS, findLook, lookCssVariables, DEFAULT_LOOK_KEY } from "../looks";
import { analyticsAttributes } from "../analytics";
import { GarmentArt } from "./garment-art";
import { formatMoney } from "@/lib/money";


/** Interactive demo storefront. Fictional store; the switcher applies each theme look's tokens. */
export function StorefrontPreview({ showPicker = true, initialLook = DEFAULT_LOOK_KEY }: { showPicker?: boolean; initialLook?: string }) {
  const [key, setKey] = useState(initialLook);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const look = findLook(key);
  const vars = lookCssVariables(look) as CSSProperties;
  const heading: CSSProperties = { fontFamily: "var(--pv-heading)", textTransform: look.headingCase === "uppercase" ? "uppercase" : "none", letterSpacing: look.headingCase === "uppercase" ? "0.08em" : undefined };
  const body: CSSProperties = { fontFamily: "var(--pv-body)" };
  const products = DEMO_PRODUCTS.slice(0, 4);
  return (
    <div>
      {showPicker ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Theme look" className="flex flex-wrap gap-2">
            {THEME_LOOKS.map((l) => (
              <button
                key={l.key}
                type="button"
                role="radio"
                aria-checked={l.key === key}
                onClick={() => setKey(l.key)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${l.key === key ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-foreground"}`}
                {...analyticsAttributes("theme_preview", l.key, "preview")}
              >
                <span className="flex -space-x-1" aria-hidden="true">
                  {[l.colors.background, l.colors.accent, l.colors.text].map((c) => (
                    <span key={c} className="size-3.5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </span>
                {l.name}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Device" className="inline-flex rounded-full border border-border bg-surface p-1 text-xs">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 capitalize ${device === d ? "bg-foreground text-background" : ""}`} {...analyticsAttributes("device_preview", d, "preview")}>
                {d}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <figure className={`mx-auto overflow-hidden rounded-2xl border border-border shadow-2xl shadow-black/10 transition-all duration-500 ${device === "mobile" ? "max-w-[390px]" : "max-w-full"}`}>
        <div className="flex items-center gap-1.5 border-b border-border bg-surface px-3 py-2" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate rounded bg-background px-2 py-0.5 text-[11px] text-muted">{DEMO_STORE.domain}</span>
        </div>
        <div style={{ ...vars, ...body, background: "var(--pv-bg)", color: "var(--pv-text)" }} className="@container">
          <p className="px-3 py-1.5 text-center text-[11px]" style={{ background: "var(--pv-ann-bg)", color: "var(--pv-ann-text)" }}>
            {DEMO_STORE.announcement}
          </p>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--pv-border)" }}>
            <span className="text-lg" style={heading}>
              {DEMO_STORE.name}
            </span>
            <span className="hidden gap-4 text-xs @md:flex" style={{ color: "var(--pv-muted)" }}>
              {DEMO_STORE.menu.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </span>
            <span className="text-xs">Bag (2)</span>
          </div>
          <div className="grid items-center gap-4 px-4 py-6 @md:grid-cols-2 @md:py-10" style={{ background: "var(--pv-surface)" }}>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--pv-accent)" }}>
                {DEMO_STORE.heroEyebrow}
              </p>
              <p className="mt-2 text-3xl leading-tight @md:text-4xl" style={heading}>
                {DEMO_STORE.heroTitle}
              </p>
              <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--pv-muted)" }}>
                {DEMO_STORE.heroBody}
              </p>
              <span className="mt-4 inline-block px-4 py-2 text-xs font-semibold" style={{ background: "var(--pv-accent)", color: "var(--pv-on-accent)", borderRadius: "var(--pv-btn-radius)" }}>
                {DEMO_STORE.heroCta}
              </span>
            </div>
            <GarmentArt art={DEMO_PRODUCTS[1]!.art} className="hidden aspect-[4/5] w-full @md:block" />
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 @md:grid-cols-4">
            {products.map((p) => (
              <div key={p.id} className="group">
                <div className="relative overflow-hidden" style={{ borderRadius: "var(--pv-card-radius)" }}>
                  <GarmentArt art={p.art} className="aspect-[4/5] w-full transition-opacity duration-300 group-hover:opacity-0" />
                  <GarmentArt art={p.hoverArt} className="absolute inset-0 aspect-[4/5] w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  {p.badge ? (
                    <span className="absolute left-2 top-2 px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--pv-bg)", borderRadius: "var(--pv-btn-radius)" }}>
                      {p.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 truncate text-xs">{p.name}</p>
                <p className="text-xs">
                  {formatMoney(p.price * 100)}{" "}
                  {p.compareAt ? (
                    <s className="ml-1" style={{ color: "var(--pv-muted)" }}>
                      {formatMoney(p.compareAt * 100)}
                    </s>
                  ) : null}
                </p>
                <span className="mt-1 flex gap-1" aria-hidden="true">
                  {p.swatches.map((s) => (
                    <span key={s} className="size-2.5 rounded-full border border-black/10" style={{ background: s }} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <figcaption className="border-t border-border bg-surface px-3 py-2 text-center text-[11px] text-muted">
          Demo store, fictional products · {look.name}: {look.tagline}
        </figcaption>
      </figure>
    </div>
  );
}
