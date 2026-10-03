"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Images, Search, X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { listMediaAction } from "../actions";
import type { MediaItem } from "../server/media";
import { Dropzone, MediaGrid, UploadQueue } from "./media-ui";
import { useMediaUploads } from "./use-media-uploads";

type Props = {
  /** Called with the chosen image(s). */
  onSelect: (items: MediaItem[]) => void;
  multiple?: boolean;
  /** Folder for images uploaded from inside the picker. */
  folder?: string;
  triggerLabel?: ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  title?: string;
};

/** "Select from media library" dialog with in-place upload. Reads through listMediaAction (RLS). */
export function MediaPicker({ onSelect, multiple = false, folder = "general", triggerLabel = "Choose image", triggerVariant = "secondary", triggerSize = "sm", title }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, MediaItem>>(new Map());

  const load = useCallback(async (term: string, p: number) => {
    setLoading(true);
    setError(null);
    const r = await listMediaAction({ q: term || undefined, page: p, pageSize: 36 });
    setLoading(false);
    if (!r.ok) return setError(r.error.message);
    setTotal(r.data.total);
    setItems((prev) => (p === 1 ? r.data.items : [...prev, ...r.data.items]));
  }, []);

  const uploads = useMediaUploads({
    folder,
    onUploaded: (item) => {
      setItems((prev) => [item, ...prev.filter((x) => x.id !== item.id)]);
      setTotal((t) => t + 1);
      setSelected((s) => (multiple ? new Map(s).set(item.id, item) : new Map([[item.id, item]])));
      setTab("library");
    },
  });

  useEffect(() => {
    if (!ref.current?.open) return;
    const t = setTimeout(() => {
      setPage(1);
      void load(q, 1);
    }, 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const openPicker = () => {
    setSelected(new Map());
    setTab("library");
    ref.current?.showModal();
    setPage(1);
    void load(q, 1);
  };
  const toggle = (m: MediaItem) =>
    setSelected((s) => {
      if (!multiple) return s.has(m.id) ? new Map() : new Map([[m.id, m]]);
      const next = new Map(s);
      if (next.has(m.id)) next.delete(m.id);
      else next.set(m.id, m);
      return next;
    });
  const confirm = () => {
    onSelect([...selected.values()]);
    ref.current?.close();
  };

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={openPicker}>
        <Images aria-hidden /> {triggerLabel}
      </Button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto h-[min(88dvh,760px)] w-[min(96vw,1040px)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/50">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <h2 id={titleId} className="text-h2">
              {title ?? (multiple ? "Choose images" : "Choose an image")}
            </h2>
            <div role="tablist" aria-label="Source" className="ml-2 inline-flex rounded-md bg-surface-secondary p-0.5">
              {(["library", "upload"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("rounded-[5px] px-3 py-1 text-small font-medium", tab === t ? "bg-surface shadow-xs" : "text-muted hover:text-foreground")}
                >
                  {t === "library" ? "Media library" : "Upload new"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => ref.current?.close()} aria-label="Close">
              <X aria-hidden />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "upload" ? (
              <div className="space-y-4">
                <Dropzone onFiles={uploads.addFiles} multiple={multiple} />
                <UploadQueue tasks={uploads.tasks} onCancel={uploads.cancel} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative max-w-sm">
                  <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <label htmlFor={`${titleId}-q`} className="sr-only">
                    Search media
                  </label>
                  <input
                    id={`${titleId}-q`}
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search images"
                    className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-small focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
                  />
                </div>
                {error ? <p className="text-small text-error">{error}</p> : null}
                {items.length ? (
                  <MediaGrid items={items} selected={new Set(selected.keys())} onSelect={toggle} />
                ) : loading ? (
                  <ul className="grid grid-cols-3 gap-3 md:grid-cols-6" aria-hidden>
                    {Array.from({ length: 12 }, (_, i) => (
                      <li key={i} className="aspect-square animate-pulse rounded-lg bg-surface-secondary" />
                    ))}
                  </ul>
                ) : (
                  <div className="py-16 text-center">
                    <p className="text-h3">{q ? "No images match" : "No images yet"}</p>
                    <p className="mt-1 text-small text-muted">{q ? "Try another search." : "Upload your first image to get started."}</p>
                    {!q ? (
                      <Button className="mt-4" variant="secondary" onClick={() => setTab("upload")}>
                        Upload images
                      </Button>
                    ) : null}
                  </div>
                )}
                {items.length < total ? (
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      pending={loading}
                      onClick={() => {
                        const p = page + 1;
                        setPage(p);
                        void load(q, p);
                      }}
                    >
                      Load more
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-small text-muted">{selected.size ? `${selected.size} selected` : multiple ? "Select one or more images" : "Select an image"}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => ref.current?.close()}>
                Cancel
              </Button>
              <Button onClick={confirm} disabled={!selected.size}>
                {multiple ? `Add ${selected.size || ""} ${selected.size === 1 ? "image" : "images"}`.replace("  ", " ") : "Use image"}
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
