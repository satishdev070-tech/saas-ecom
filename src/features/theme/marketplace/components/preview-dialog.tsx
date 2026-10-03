"use client";

import { useEffect, useId, useRef, useState } from "react";
import { THEME_PREVIEW_ESCAPE_MESSAGE } from "../live-preview";
import { ExternalLink, Monitor, Smartphone, X } from "lucide-react";

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;

/**
 * Live Preview: the theme's demo store in an iframe, rendered with that theme in memory
 * (`?sf_theme=<key>`). Desktop renders at 1280px and scales to fit; mobile renders at 390px.
 * The seller's own store and theme are never involved.
 */
export function ThemePreviewDialog({ name, url, onClose, actions }: { name: string; url: string; onClose: () => void; actions?: React.ReactNode }) {
  // Narrow screens start on Mobile: a 1280px desktop scaled to a phone is unreadable.
  // (The dialog only mounts on the client, after a click, so window is available.)
  const [device, setDevice] = useState<"desktop" | "mobile">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop"));
  const titleId = useId();
  const descId = useId();
  const [loaded, setLoaded] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  // Stage width is measured in the ResizeObserver (never read from the ref during render).
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  // Escape pressed while focus is inside the framed store (a cross-origin frame) arrives as a message.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source && e.source === frame.current?.contentWindow && (e.data as { type?: unknown } | null)?.type === THEME_PREVIEW_ESCAPE_MESSAGE) dialog.current?.close();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setStageWidth(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = device === "desktop" ? DESKTOP_WIDTH : MOBILE_WIDTH;
  const scale = device === "desktop" && stageWidth ? Math.min(1, stageWidth / DESKTOP_WIDTH) : 1;
  const frameWidth = device === "desktop" ? DESKTOP_WIDTH * scale : Math.min(MOBILE_WIDTH + 12, stageWidth ?? MOBILE_WIDTH + 12);
  const tab = (d: "desktop" | "mobile", label: string, Icon: typeof Monitor) => (
    <button
      type="button"
      aria-pressed={device === d}
      onClick={() => {
        if (device === d) return;
        setDevice(d);
        setLoaded(false);
      }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-small sm:px-3 ${device === d ? "bg-surface shadow-xs" : "text-muted hover:text-foreground"}`}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      // Only onClose: the native Escape (cancel) closes the dialog first, so focus goes back to
      // the button that opened it before we unmount.
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col bg-surface-secondary">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border bg-surface px-3 py-2.5 sm:gap-x-3 sm:px-4">
          <div className="order-1 w-[calc(100%-2.5rem)] min-w-0 sm:w-auto sm:flex-1">
            <h2 id={titleId} className="truncate font-semibold">
              {name} <span className="font-normal text-muted">· Live preview</span>
            </h2>
            <p id={descId} className="truncate text-caption text-muted">Shown on a demo store. Nothing changes on your store.</p>
          </div>
          <div role="group" aria-label="Preview device" className="order-3 flex gap-1 rounded-lg bg-surface-secondary p-1 sm:order-2">
            {tab("desktop", "Desktop", Monitor)}
            {tab("mobile", "Mobile", Smartphone)}
          </div>
          <div className="order-4 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0">
            {actions}
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open the preview in a new tab" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-small hover:bg-surface-secondary sm:px-3">
              <span className="hidden sm:inline">New tab</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close preview" className="order-2 inline-flex size-8 items-center justify-center rounded-md hover:bg-surface-secondary sm:order-4">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div ref={stage} className="relative flex-1 overflow-hidden p-0 sm:p-4">
          <div
            className={`mx-auto h-full overflow-hidden bg-white ${device === "mobile" ? "rounded-[28px] border-[6px] border-neutral-900 shadow-lg sm:max-h-[844px]" : "rounded-md border border-border shadow-sm"}`}
            style={{ width: frameWidth }}
          >
            <iframe
              ref={frame}
              key={device}
              src={url}
              title={`${name} theme preview (${device})`}
              onLoad={() => setLoaded(true)}
              style={{ width, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, maxWidth: device === "mobile" ? "100%" : undefined }}
            />
          </div>
          {!loaded ? <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-small text-muted">Loading the demo store…</p> : null}
        </div>
      </div>
    </dialog>
  );
}

/** Button that opens the Live Preview dialog (for server-rendered pages). */
export function LivePreviewButton({ name, url, size = "sm", actions }: { name: string; url: string; size?: "sm" | "md"; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 text-small hover:bg-surface-secondary ${size === "md" ? "h-9" : "h-8"}`}>
        <Monitor className="size-4" aria-hidden /> Live preview
      </button>
      {open ? <ThemePreviewDialog name={name} url={url} onClose={() => setOpen(false)} actions={actions} /> : null}
    </>
  );
}
