"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { Carousel } from "./carousel";

export type VideoShopItem = {
  /** MP4 URL (store asset) or a YouTube/Vimeo embed URL. */
  src: string | null;
  embed: string | null;
  poster: string | null;
  title: string;
  product: { href: string; title: string; priceMinor: number; compareAtMinor: number | null; image: string | null } | null;
};

/** Plays muted inline previews only while on screen (saves data and battery). */
function InlinePreview({ item, className }: { item: VideoShopItem; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? el.play().catch(() => undefined) : el.pause()), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!item.src) {
    // eslint-disable-next-line @next/next/no-img-element -- remote poster, fixed box
    return item.poster ? <img src={item.poster} alt="" className={className} loading="lazy" /> : <div className={`${className} bg-black/10`} />;
  }
  return <video ref={ref} src={item.src} poster={item.poster ?? undefined} className={className} muted loop playsInline preload="metadata" aria-hidden />;
}

/** Shoppable videos: round stories or 9:16 cards; tapping opens a player with the linked product. */
export function VideoShop({ items, layout }: { items: VideoShopItem[]; layout: "stories" | "cards" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const open = (i: number) => {
    setActive(i);
    dialog.current?.showModal();
  };
  const current = active === null ? null : items[active];
  const step = (d: number) => setActive((i) => (i === null ? i : (i + d + items.length) % items.length));

  return (
    <>
      <Carousel label="Videos" itemClassName={layout === "stories" ? "w-20 text-center @[48rem]:w-24" : "w-[44%] @[48rem]:w-[23%] @[64rem]:w-[18%]"}>
        {items.map((it, i) => (
          <div key={i}>
            <button type="button" onClick={() => open(i)} className="block w-full text-left" aria-label={`Play ${it.title || "video"}`}>
              {layout === "stories" ? (
                <span className="block rounded-full p-[3px]" style={{ background: "conic-gradient(var(--sf-accent), var(--sf-primary), var(--sf-accent))" }}>
                  <span className="block overflow-hidden rounded-full border-2 border-[var(--sf-bg)]">
                    <InlinePreview item={it} className="aspect-square w-full object-cover" />
                  </span>
                </span>
              ) : (
                <span className="relative block overflow-hidden rounded-[var(--sf-radius-card)]">
                  <InlinePreview item={it} className="aspect-[9/16] w-full object-cover" />
                  <span aria-hidden className="absolute bottom-2 left-2 grid size-8 place-items-center rounded-full bg-black/55 text-white">▶</span>
                </span>
              )}
              {it.title ? <span className={`mt-2 block truncate text-xs ${layout === "stories" ? "text-center" : ""}`}>{it.title}</span> : null}
              {layout === "cards" && it.product ? <span className="block truncate text-xs font-medium">{formatMoney(it.product.priceMinor)}</span> : null}
            </button>
          </div>
        ))}
      </Carousel>

      <dialog ref={dialog} onClose={() => setActive(null)} aria-label="Video" className="m-auto w-[min(94vw,420px)] overflow-hidden rounded-xl bg-black p-0 text-white backdrop:bg-black/70">
        {current ? (
          <div className="relative">
            {current.src ? (
              <video key={current.src} src={current.src} poster={current.poster ?? undefined} className="aspect-[9/16] max-h-[78vh] w-full bg-black object-contain" autoPlay controls playsInline />
            ) : current.embed ? (
              <iframe key={current.embed} src={current.embed} title={current.title || "Video"} className="aspect-[9/16] max-h-[78vh] w-full" allow="autoplay; encrypted-media; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" />
            ) : null}
            <button type="button" onClick={() => dialog.current?.close()} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-lg" aria-label="Close video">
              ×
            </button>
            {items.length > 1 ? (
              <>
                <button type="button" onClick={() => step(-1)} className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/50" aria-label="Previous video">‹</button>
                <button type="button" onClick={() => step(1)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/50" aria-label="Next video">›</button>
              </>
            ) : null}
            {current.product ? (
              <Link href={current.product.href} className="flex items-center gap-3 bg-white p-3 text-[var(--sf-text)]" onClick={() => dialog.current?.close()}>
                {current.product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                  <img src={current.product.image} alt="" className="size-14 rounded object-cover" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{current.product.title}</span>
                  <span className="text-sm">
                    {formatMoney(current.product.priceMinor)}
                    {current.product.compareAtMinor ? <del className="sf-muted ml-2 text-xs">{formatMoney(current.product.compareAtMinor)}</del> : null}
                  </span>
                </span>
                <span className="sf-btn shrink-0 !px-4 !py-2 text-xs">Shop now</span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
