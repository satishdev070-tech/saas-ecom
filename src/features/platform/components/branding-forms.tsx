"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { clearBrandImageAction, uploadBrandImageAction } from "../actions";
import type { BrandSlot } from "../public-config";

/* eslint-disable @next/next/no-img-element -- previews show the files exactly as uploaded */

/**
 * Upload / replace / remove one platform brand image. The chosen file is previewed before upload
 * (local object URL, nothing leaves the browser until "Upload" is pressed).
 */
export function BrandImageForm({ slot, current, dark = false, accept, hint }: { slot: BrandSlot; current: { src: string; width: number | null; height: number | null } | null; dark?: boolean; accept: string; hint: string }) {
  const inputId = useId();
  const [picked, setPicked] = useState<{ url: string; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked]);
  // The form resets after a successful upload; drop the local preview with it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setPicked(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const shown = picked?.url ?? current?.src ?? null;
  const wide = slot === "og_image";
  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-center overflow-hidden rounded-md border border-border ${wide ? "aspect-[1200/630]" : "min-h-20 p-4"} ${dark ? "bg-[#0b1b3f]" : "bg-surface-secondary"}`}>
        {shown ? (
          <img src={shown} alt={picked ? "Selected image (not uploaded yet)" : "Current image"} className={slot === "favicon" ? "size-12 object-contain" : wide ? "size-full object-cover" : "max-h-12 w-auto max-w-full object-contain"} />
        ) : (
          <span className={`px-3 text-center text-small ${dark ? "text-white/70" : "text-muted"}`}>{wide ? "Not set: a generated card is used." : "Not set: the text wordmark / default icon is used."}</span>
        )}
      </div>
      {picked ? <p className="text-caption text-warning">Preview of {picked.name}. Select Upload to save it.</p> : null}
      <ActionForm action={uploadBrandImageAction} fields={{ slot }} submitLabel={current ? "Upload & replace" : "Upload"} submitVariant="secondary" encType="multipart/form-data" resetOnSuccess success="Saved. It's live on the website now." className="space-y-3">
        {(e) => (
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2.5 text-small hover:bg-surface-secondary focus-within:outline-2 focus-within:outline-accent">
              <ImageUp aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="truncate">{picked ? picked.name : "Choose an image…"}</span>
              <input
                ref={input}
                id={inputId}
                type="file"
                name="file"
                accept={accept}
                required
                className="sr-only"
                aria-describedby={`${inputId}-hint`}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  setPicked(f ? { url: URL.createObjectURL(f), name: f.name } : null);
                }}
              />
            </label>
            <p id={`${inputId}-hint`} className="text-caption text-muted">
              {hint}
            </p>
            {e.file?.map((m) => (
              <p key={m} role="alert" className="text-caption text-error">
                {m}
              </p>
            ))}
          </div>
        )}
      </ActionForm>
      {current ? <InlineAction action={clearBrandImageAction} fields={{ slot }} label="Remove" variant="ghost" success="Removed." /> : null}
    </div>
  );
}
