"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addToCartAction } from "@/features/cart/actions";
import { findVariant, initialSelection, isColourOption, isSizeOption, selectValue, stockLabel, valueState, type PdpOption, type PdpVariant, type Selection } from "@/features/storefront/variants";
import type { ProductMedia, SizeChart } from "@/features/storefront/server/catalog";
import { assetUrl } from "@/lib/storage/assets";
import { Price } from "./price";
import { openCartDrawer } from "./header-islands";
import { track } from "@/features/tracking/client";

function Gallery({ media, activePath, title }: { media: ProductMedia[]; activePath: string | null; title: string }) {
  const ordered = useMemo(() => {
    if (!activePath) return media;
    const first = media.find((m) => m.path === activePath);
    return first ? [first, ...media.filter((m) => m !== first)] : media;
  }, [media, activePath]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const safe = Math.min(index, Math.max(0, ordered.length - 1));
  const current = ordered[safe];
  const src = current ? assetUrl(current.path) : null;
  const show = (i: number) => {
    const n = (i + ordered.length) % ordered.length;
    setIndex(n);
    const thumb = strip.current?.children[n] as HTMLElement | undefined;
    thumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };
  const many = ordered.length > 1;
  return (
    <div className="space-y-3">
      <div
        className="sf-pdp-main group/main relative aspect-[3/4] cursor-zoom-in overflow-hidden"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
        onClick={() => dialog.current?.showModal()}
      >
        {src ? (
          <Image
            key={src}
            src={src}
            alt={current?.alt || title}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="sf-pdp-fade object-cover transition-transform duration-200 motion-reduce:transition-none"
            style={zoom ? { transform: "scale(1.8)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[var(--sf-border)]" />
        )}
        {many ? (
          <>
            <button type="button" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); show(safe - 1); }} className="sf-carousel-btn left-3 opacity-0 transition group-hover/main:opacity-90">
              <Arrow dir="left" />
            </button>
            <button type="button" aria-label="Next image" onClick={(e) => { e.stopPropagation(); show(safe + 1); }} className="sf-carousel-btn right-3 opacity-0 transition group-hover/main:opacity-90">
              <Arrow dir="right" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
              {safe + 1} / {ordered.length}
            </span>
          </>
        ) : null}
      </div>
      {many ? (
        <div className="relative flex items-center gap-2">
          <button type="button" aria-label="Previous image" onClick={() => show(safe - 1)} className="sf-pdp-thumb-arrow">
            <Arrow dir="left" />
          </button>
          <ul ref={strip} className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Product images">
            {ordered.map((m, i) => {
              const u = assetUrl(m.path);
              return u ? (
                <li key={m.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => show(i)}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={i === safe}
                    className={`sf-pdp-thumb relative block aspect-square w-[4.5rem] overflow-hidden @[48rem]:w-24 ${i === safe ? "is-active" : ""}`}
                  >
                    <Image src={u} alt="" fill sizes="96px" className="object-cover" />
                  </button>
                </li>
              ) : null;
            })}
          </ul>
          <button type="button" aria-label="Next image" onClick={() => show(safe + 1)} className="sf-pdp-thumb-arrow">
            <Arrow dir="right" />
          </button>
        </div>
      ) : null}
      <dialog ref={dialog} className="sf-dialog sf-dialog-full" aria-label={`${title} images`}>
        <button type="button" onClick={() => dialog.current?.close()} className="sf-btn sf-btn-outline fixed right-4 top-4 z-10 min-h-10 py-2">
          Close
        </button>
        <div className="space-y-4 p-4">
          {ordered.map((m) => {
            const u = assetUrl(m.path);
            // eslint-disable-next-line @next/next/no-img-element -- full-resolution zoom view
            return u ? <img key={m.id} src={u} alt={m.alt || title} className="mx-auto max-h-[90vh] w-auto" loading="lazy" /> : null;
          })}
        </div>
      </dialog>
    </div>
  );
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function SizeGuide({ chart }: { chart: SizeChart }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="sf-link text-sm" onClick={() => ref.current?.showModal()}>
        Size guide
      </button>
      <dialog ref={ref} className="sf-dialog sf-dialog-center" aria-labelledby="sg-title">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="sg-title" className="sf-heading text-xl">
              {chart.name} <span className="sf-muted text-sm">({chart.unit === "cm" ? "centimetres" : "inches"})</span>
            </h2>
            <button type="button" onClick={() => ref.current?.close()} className="sf-link text-sm">
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {chart.columns.map((c) => (
                    <th key={c} scope="col" className="sf-border border-b px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) =>
                      j === 0 ? (
                        <th key={j} scope="row" className="sf-border border-b px-3 py-2 font-medium">
                          {cell}
                        </th>
                      ) : (
                        <td key={j} className="sf-border border-b px-3 py-2">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chart.note ? <p className="sf-muted mt-3 text-xs">{chart.note}</p> : null}
        </div>
      </dialog>
    </>
  );
}

export type PdpPanel = { key: string; title: string; icon: "description" | "details" | "care" | "shipping" | "size"; content: ReactNode; open?: boolean };

const PANEL_ICONS: Record<PdpPanel["icon"], ReactNode> = {
  description: <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />,
  details: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  care: <path d="M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1zM9 11h6M9 15h4" />,
  shipping: <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  size: <path d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4" />,
};

/** Accordion row with a line icon (Product description, details, care, shipping…). */
function Panel({ panel }: { panel: PdpPanel }) {
  return (
    <details open={panel.open} className="sf-pdp-panel group">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-80">
          {PANEL_ICONS[panel.icon]}
        </svg>
        <span className="flex-1 text-[15px]">{panel.title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 transition-transform duration-200 group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="sf-pdp-panel-body pb-5 pl-8 text-sm leading-relaxed">{panel.content}</div>
    </details>
  );
}

/** Product gallery + variant selection + add to cart / buy now + detail accordions. */
export function ProductPurchase({
  title,
  brand,
  options,
  variants,
  media,
  sizeChart,
  codNote,
  rating,
  highlight,
  panels = [],
  footer,
}: {
  title: string;
  /** Small line above the title (store / brand name). */
  brand?: string | null;
  options: PdpOption[];
  variants: PdpVariant[];
  media: ProductMedia[];
  sizeChart: SizeChart | null;
  codNote: string | null;
  /** Server-rendered rating summary shown under the title (links to reviews). */
  rating?: ReactNode;
  /** Boxed highlight under the price (e.g. packaging or COD note). */
  highlight?: string | null;
  panels?: PdpPanel[];
  /** Wishlist / share row under the accordions. */
  footer?: ReactNode;
}) {
  const [sel, setSel] = useState<Selection>(() => initialSelection(variants, options));
  const [qty, setQty] = useState(1);
  const [state, action, pending] = useActionState(addToCartAction, null);
  // Successful "Add to bag" (Buy now redirects server-side) → show the bag drawer.
  useEffect(() => {
    if (!state?.ok) return;
    openCartDrawer();
    track("add_to_cart", { value: state.data.item.price * state.data.item.quantity, items: [state.data.item] });
  }, [state]);
  const variant = findVariant(variants, options, sel);
  const label = stockLabel(variant);
  const maxQty = Math.max(1, Math.min(10, variant?.available ?? 10));
  const quantity = Math.min(qty, maxQty);
  const complete = options.every((o) => sel[o.position]);
  const priceV = variant ?? variants[0];
  const note = highlight ?? codNote;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 @[64rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @[64rem]:gap-14">
      {/* Gallery stays in view while the (longer) details column scrolls: no empty space beside it. */}
      <div className="min-w-0 @[64rem]:sticky @[64rem]:top-24 @[64rem]:self-start">
        <Gallery media={media} activePath={variant?.imagePath ?? null} title={title} />
      </div>
      <div className="min-w-0">
        <div className="space-y-3">
          {brand ? <p className="sf-muted text-sm tracking-wide">{brand}</p> : null}
          <h1 className="sf-heading text-3xl leading-tight @[64rem]:text-[2.6rem]">{title}</h1>
          {rating}
          {priceV ? <Price priceMinor={priceV.priceMinor} compareAtMinor={priceV.compareAtMinor} size="lg" /> : null}
          <p className="sf-muted text-xs">
            Inclusive of all taxes · <span className="underline underline-offset-2">Shipping</span> calculated at checkout
            {variant?.sku ? <span> · SKU {variant.sku}</span> : null}
          </p>
          {note ? <p className="sf-pdp-highlight">{note}</p> : null}
        </div>

        <div className="mt-6 space-y-5">
          {options.map((o) => {
            const colour = isColourOption(o.name);
            return (
              <fieldset key={o.position}>
                <legend className="mb-2.5 flex w-full items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">{o.name}</span>
                    {sel[o.position] ? <span className="sf-muted">: {sel[o.position]}</span> : null}
                  </span>
                  {isSizeOption(o.name) && sizeChart ? <SizeGuide chart={sizeChart} /> : null}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {o.values.map((v) => {
                    const st = valueState(variants, options, sel, o.position, v.value);
                    const selected = sel[o.position] === v.value;
                    return (
                      <label
                        key={v.value}
                        className={`relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center border px-3.5 text-sm transition ${
                          selected ? "border-[var(--sf-primary)] bg-[var(--sf-primary)] text-[var(--sf-primary-fg)]" : "sf-border hover:border-[var(--sf-text)]"
                        } ${st !== "available" ? "opacity-45 line-through" : ""} ${colour ? "rounded-full px-1" : "rounded-full"}`}
                        title={st === "soldout" ? `${v.value} — sold out` : v.value}
                      >
                        <input
                          type="radio"
                          name={`opt-${o.position}`}
                          value={v.value}
                          checked={selected}
                          disabled={st === "unavailable"}
                          onChange={() => setSel((s) => selectValue(variants, options, s, o.position, v.value))}
                          className="sr-only"
                        />
                        {colour && v.swatch ? <span aria-hidden className="block size-7 rounded-full border border-black/10" style={{ background: v.swatch }} /> : null}
                        <span className={colour && v.swatch ? "sr-only" : ""}>{v.value}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {options.length || label.tone !== "ok" ? (
            <p aria-live="polite" className={`text-sm ${label.tone === "out" ? "text-[var(--sf-sale)]" : label.tone === "low" ? "text-[var(--sf-accent)]" : "sf-muted"}`}>
              {complete ? label.text : `Select ${options.filter((o) => !sel[o.position]).map((o) => o.name.toLowerCase()).join(" and ")}`}
            </p>
          ) : null}

          <form action={action} className="space-y-3">
            <input type="hidden" name="variantId" value={variant?.id ?? ""} />
            <input type="hidden" name="quantity" value={quantity} />
            <div>
              <p className="mb-2 text-sm">Quantity</p>
              <div className="sf-qty" role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty(Math.max(1, quantity - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">
                  −
                </button>
                <output aria-live="polite">{quantity}</output>
                <button type="button" onClick={() => setQty(Math.min(maxQty, quantity + 1))} disabled={quantity >= maxQty} aria-label="Increase quantity">
                  +
                </button>
              </div>
            </div>
            <div className="grid gap-2.5 pt-1 @[64rem]:max-w-md">
              <button type="submit" disabled={!variant || !variant.inStock || pending} className="sf-btn sf-btn-outline w-full">
                {pending ? "Adding…" : state?.ok ? "Added to bag ✓" : "Add to bag"}
              </button>
              <button type="submit" name="buyNow" value="1" disabled={!variant || !variant.inStock || pending} className="sf-btn w-full">
                Buy it now
              </button>
            </div>
            {state && !state.ok ? (
              <p role="alert" className="text-sm text-[var(--sf-sale)]">
                {state.error.message}
              </p>
            ) : null}
            {state?.ok ? (
              <p role="status" className="text-sm">
                Added. <a href="/cart" className="sf-link">View bag ({state.data.count})</a>
              </p>
            ) : null}
          </form>
        </div>

        {panels.length ? (
          <div className="sf-pdp-panels mt-8">
            {panels.map((p) => (
              <Panel key={p.key} panel={p} />
            ))}
          </div>
        ) : null}
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
