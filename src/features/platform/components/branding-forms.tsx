"use client";

import { ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { clearBrandImageAction, uploadBrandImageAction } from "../actions";
import type { BrandSlot } from "../public-config";

/** Upload / replace / remove one marketing-site brand image. */
export function BrandImageForm({ slot, current, dark = false, accept, hint }: { slot: BrandSlot; current: { src: string; width: number | null; height: number | null } | null; dark?: boolean; accept: string; hint: string }) {
  return (
    <div className="space-y-3">
      <div className={`flex min-h-20 items-center justify-center rounded-md border border-border p-4 ${dark ? "bg-[#0b1b3f]" : "bg-surface-secondary"}`}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.src} alt="Current image" className={slot === "favicon" ? "size-12" : "max-h-12 w-auto max-w-full"} />
        ) : (
          <span className={`text-small ${dark ? "text-white/70" : "text-muted"}`}>Not set: the text wordmark / default icon is used.</span>
        )}
      </div>
      <ActionForm action={uploadBrandImageAction} fields={{ slot }} submitLabel={current ? "Replace" : "Upload"} submitVariant="secondary" encType="multipart/form-data" resetOnSuccess success="Saved. The public site shows it within a minute." className="space-y-3">
        {(e) => (
          <div className="space-y-1">
            <input type="file" name="file" accept={accept} required className="block text-small" aria-label={`Upload ${slot.replace("_", " ")}`} aria-describedby={`${slot}-hint`} />
            <p id={`${slot}-hint`} className="text-caption text-muted">
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
