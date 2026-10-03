"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { AlertCircle, Check, CheckCircle2, Copy, ImagePlus, LoaderCircle, RotateCw, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, inputClassName } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { MEDIA_ACCEPT, MEDIA_FOLDERS, MEDIA_MAX_BYTES, MEDIA_TYPE_LABEL, formatBytes } from "../rules";
import { deleteMediaAction, mediaUsageAction, updateMediaAction } from "../actions";
import type { MediaItem, MediaUsage } from "../server/media";
import { useMediaUploads, type UploadTask } from "./use-media-uploads";

// ------------------------------------------------------------------ dropzone

export function Dropzone({ onFiles, compact = false, multiple = true, disabled = false }: { onFiles: (files: FileList) => void; compact?: boolean; multiple?: boolean; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const hintId = useId();
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!disabled && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-6" : "px-6 py-14",
        over ? "border-accent bg-accent-soft/60" : "border-border-strong bg-surface-secondary/40",
        disabled && "opacity-60",
      )}
    >
      <span className={cn("grid place-items-center rounded-full bg-surface shadow-sm ring-1 ring-border", compact ? "size-10" : "size-12")}>
        <UploadCloud aria-hidden className={cn("text-accent", compact ? "size-5" : "size-6")} strokeWidth={1.75} />
      </span>
      <div>
        <p className="text-h3">{over ? "Drop to upload" : "Drag & drop images here"}</p>
        <p id={hintId} className="mt-1 text-small text-muted">
          {MEDIA_TYPE_LABEL} · up to {formatBytes(MEDIA_MAX_BYTES)} each
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()} aria-describedby={hintId}>
        <ImagePlus aria-hidden /> Browse files
      </Button>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ upload queue

const STATUS_LABEL: Record<UploadTask["status"], string> = { queued: "Waiting", uploading: "Uploading", processing: "Checking", done: "Uploaded", error: "Failed", cancelled: "Cancelled" };

export function UploadQueue({ tasks, onCancel, onRetry, onDismiss, onClear }: { tasks: UploadTask[]; onCancel: (id: string) => void; onRetry: (id: string) => void; onDismiss: (id: string) => void; onClear?: () => void }) {
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="rounded-lg border border-border bg-surface shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-h4">
          Uploads <span className="font-normal text-muted">· {done} of {tasks.length} done</span>
        </p>
        {onClear && done ? (
          <button type="button" onClick={onClear} className="text-small text-muted hover:text-foreground">
            Clear finished
          </button>
        ) : null}
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto" aria-live="polite">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={t.previewUrl} alt="" className="size-10 shrink-0 rounded-md object-cover ring-1 ring-border" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-small font-medium">{t.name}</p>
                <p className="shrink-0 text-caption text-muted">
                  {formatBytes(t.size)} · {t.type.replace("image/", "").toUpperCase()}
                </p>
              </div>
              {t.status === "error" ? (
                <p className="mt-0.5 flex items-center gap-1 text-caption text-error">
                  <AlertCircle aria-hidden className="size-3.5" /> {t.error}
                </p>
              ) : (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} upload progress`}>
                    <div className={cn("h-full rounded-full transition-[width]", t.status === "done" ? "bg-success" : t.status === "cancelled" ? "bg-border-strong" : "bg-accent")} style={{ width: `${t.status === "done" ? 100 : t.progress}%` }} />
                  </div>
                  <span className="w-20 text-right text-caption text-muted">{t.status === "uploading" ? `${t.progress}%` : STATUS_LABEL[t.status]}</span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {t.status === "done" ? <CheckCircle2 aria-label="Uploaded" className="size-4 text-success" /> : null}
              {t.status === "processing" ? <LoaderCircle aria-label="Checking file" className="size-4 animate-spin text-muted" /> : null}
              {t.status === "uploading" || t.status === "queued" ? (
                <Button size="sm" variant="ghost" onClick={() => onCancel(t.id)} aria-label={`Cancel ${t.name}`}>
                  <X aria-hidden />
                </Button>
              ) : null}
              {t.status === "error" || t.status === "cancelled" ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => onRetry(t.id)} aria-label={`Retry ${t.name}`}>
                    <RotateCw aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(t.id)} aria-label={`Dismiss ${t.name}`}>
                    <X aria-hidden />
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ grid

export function MediaGrid({ items, selected, onSelect, onOpen, selectLabel = "Select" }: { items: MediaItem[]; selected?: ReadonlySet<string>; onSelect?: (item: MediaItem) => void; onOpen?: (item: MediaItem) => void; selectLabel?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {items.map((m) => {
        const isSelected = selected?.has(m.id) ?? false;
        return (
          <li key={m.id} className="group relative">
            <button
              type="button"
              onClick={() => (onSelect ? onSelect(m) : onOpen?.(m))}
              aria-pressed={onSelect ? isSelected : undefined}
              aria-label={`${onSelect ? selectLabel : "Open"} ${m.filename}`}
              className={cn(
                "relative block aspect-square w-full overflow-hidden rounded-lg bg-surface-secondary ring-1 ring-border transition-shadow",
                isSelected ? "ring-2 ring-accent" : "hover:ring-border-strong",
              )}
            >
              <Image src={m.url} alt={m.alt || m.filename} fill sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw" className="object-cover" />
              {isSelected ? (
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-accent-foreground shadow-sm">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
              {!m.alt ? <span className="absolute bottom-2 left-2 rounded bg-warning/90 px-1.5 py-0.5 text-[10px] font-medium text-white">No alt text</span> : null}
            </button>
            {onSelect && onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(m)}
                className="absolute right-2 bottom-2 hidden rounded-md bg-surface/90 px-2 py-1 text-caption font-medium shadow-sm ring-1 ring-border group-hover:block group-focus-within:block"
              >
                Details
              </button>
            ) : null}
            <p className="mt-1.5 truncate text-caption text-muted" title={m.filename}>
              {m.filename}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ details dialog

function CopyButton({ text, label = "Copy URL" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : label}
    </Button>
  );
}

const USAGE_LABEL: Record<string, string> = { product: "Product", category: "Category", collection: "Collection", menu: "Menu item", blog: "Blog post", page: "Page", brand: "Brand", theme: "Theme" };

export function MediaDetails({ item, folders, onClose, onDeleted, onReplaced }: { item: MediaItem; folders: string[]; onClose: () => void; onDeleted?: (id: string) => void; onReplaced?: (item: MediaItem) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, action] = useActionState(updateMediaAction, null);
  const [usage, setUsage] = useState<MediaUsage[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const replace = useMediaUploads({
    folder: item.folder,
    replaceId: item.id,
    onUploaded: (it) => {
      setVersion((v) => v + 1);
      onReplaced?.(it);
    },
  });
  const replaceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    let alive = true;
    void mediaUsageAction(item.id).then((r) => alive && setUsage(r.ok ? r.data.usage : []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const allFolders = [...new Set([...MEDIA_FOLDERS, ...folders, item.folder])];
  const replacing = replace.tasks.find((t) => t.status === "uploading" || t.status === "processing");
  const replaceError = replace.tasks.find((t) => t.status === "error");

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const r = await deleteMediaAction({ id: item.id, force: Boolean(usage?.length) });
    setDeleting(false);
    if (!r.ok) setDeleteError(r.error.message);
    else if (r.data.deleted) {
      ref.current?.close();
      onDeleted?.(item.id);
    } else setUsage(r.data.usage);
  };

  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} className="m-auto w-[min(96vw,920px)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/50">
      <div className="grid max-h-[88dvh] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="relative min-h-72 bg-[repeating-conic-gradient(var(--surface-secondary)_0%_25%,var(--surface)_0%_50%)] bg-[length:20px_20px]">
          <Image key={version} src={`${item.url}${version ? `?v=${version}` : ""}`} alt={item.alt || item.filename} fill sizes="(min-width: 768px) 50vw, 96vw" className="object-contain p-4" unoptimized={version > 0} />
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-h2">
                {item.filename}
              </h2>
              <p className="mt-0.5 text-caption text-muted">
                {item.width && item.height ? `${item.width}×${item.height}px · ` : ""}
                {formatBytes(item.bytes)} · {item.mime.replace("image/", "").toUpperCase()} · added {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => ref.current?.close()} aria-label="Close">
              <X aria-hidden />
            </Button>
          </div>

          <form action={action} className="space-y-4 px-5 py-4">
            <input type="hidden" name="id" value={item.id} />
            <FormMessage state={state} success="Saved." />
            <TextField label="Alt text" name="alt" defaultValue={item.alt} maxLength={300} hint="Describe the image for screen readers and search engines." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="File name" name="filename" defaultValue={item.filename} maxLength={200} required />
              <div>
                <label htmlFor={`${titleId}-folder`} className="mb-1.5 block text-label">
                  Folder
                </label>
                <select id={`${titleId}-folder`} name="folder" defaultValue={item.folder} className={inputClassName}>
                  {allFolders.map((f) => (
                    <option key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <SubmitButton size="sm">Save details</SubmitButton>
          </form>

          <div className="space-y-3 border-t border-border px-5 py-4">
            <p className="text-h4">File</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={item.url} />
              <Button size="sm" variant="secondary" pending={Boolean(replacing)} onClick={() => replaceInput.current?.click()}>
                <RotateCw aria-hidden /> {replacing ? `Replacing ${replacing.progress}%` : "Replace"}
              </Button>
              <input
                ref={replaceInput}
                type="file"
                accept={MEDIA_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  if (e.target.files?.length) replace.addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-caption text-muted">Replacing keeps the same address, so every product, page and theme section using this image updates. Caches may take up to an hour to refresh.</p>
            {replaceError ? <p className="text-small text-error">{replaceError.error}</p> : null}
          </div>

          <div className="space-y-2 border-t border-border px-5 py-4">
            <p className="text-h4">Used in</p>
            {usage === null ? (
              <p className="text-small text-muted">Checking…</p>
            ) : usage.length ? (
              <ul className="space-y-1 text-small">
                {usage.map((u) => (
                  <li key={`${u.kind}-${u.refId}`} className="flex gap-2">
                    <span className="w-24 shrink-0 text-muted">{USAGE_LABEL[u.kind] ?? u.kind}</span>
                    <span className="truncate">{u.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted">Not used anywhere yet.</p>
            )}
          </div>

          <div className="mt-auto border-t border-border px-5 py-4">
            {confirming ? (
              <div role="alertdialog" aria-label="Confirm delete" className="space-y-3 rounded-lg border border-error/30 bg-error/5 p-3">
                <p className="text-small">
                  {usage?.length ? `This image is used in ${usage.length} ${usage.length === 1 ? "place" : "places"}. Deleting it will leave a blank image there.` : "Delete this image permanently?"}
                </p>
                {deleteError ? <p className="text-small text-error">{deleteError}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" pending={deleting} onClick={doDelete}>
                    {usage?.length ? "Delete anyway" : "Delete"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-error hover:bg-error/10" onClick={() => setConfirming(true)} disabled={usage === null}>
                <Trash2 aria-hidden /> Delete image
              </Button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
