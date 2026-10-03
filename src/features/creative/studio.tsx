"use client";

import { useActionState, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/form";
import { MediaPicker } from "@/features/media/components/media-picker";
import { renderCreativeSvg, type Brand, type CreativeTemplate, type CreativeValues, type FieldKey } from "./engine";
import { saveCreativeAction } from "./actions";

const CATEGORY: Record<string, string> = {
  new_arrival: "New arrival", sale: "Sale", festival: "Festival", product_highlight: "Product highlight", collection_launch: "Collection launch",
  bestseller: "Bestseller", limited_edition: "Limited edition", discount: "Discount", announcement: "Announcement",
};

export function CreativeStudio({ templates, brand, canSave }: { templates: CreativeTemplate[]; brand: Brand; canSave: boolean }) {
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const t = templates.find((x) => x.key === key) ?? templates[0];
  const [values, setValues] = useState<CreativeValues>({});
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [state, action] = useActionState(saveCreativeAction, null);
  const svg = useMemo(() => (t ? renderCreativeSvg(t, brand, values, image?.url ?? null) : ""), [t, brand, values, image]);
  if (!t) return <p className="text-small text-muted">No templates are available yet.</p>;
  const errors = state && !state.ok ? (state.error.fieldErrors ?? {}) : {};
  const needsImage = t.spec.fields.some((f) => f.key === "image");

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
      <nav aria-label="Templates" className="space-y-1">
        <p className="mb-2 text-caption font-medium text-muted">Templates</p>
        {templates.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setKey(x.key)}
            aria-pressed={x.key === t.key}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-small ${x.key === t.key ? "bg-accent-soft text-accent" : "hover:bg-surface-secondary"}`}
          >
            <span>{x.name}</span>
            <span className="text-caption text-muted">{x.width}×{x.height}</span>
          </button>
        ))}
      </nav>

      <div className="rounded-lg border border-border bg-surface-secondary p-4">
        <div className="mx-auto max-w-[560px] overflow-hidden rounded-md shadow-sm" style={{ aspectRatio: `${t.width}/${t.height}` }} aria-label="Design preview" role="img">
          <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        <p className="mt-3 text-center text-caption text-muted">{CATEGORY[t.category] ?? t.category} · v{t.version} · uses your brand colours and logo. The saved image uses standard serif/sans fonts.</p>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="template" value={t.key} />
        <input type="hidden" name="imagePath" value={image?.path ?? ""} />
        {needsImage ? (
          <div>
            <p className="mb-1 text-small font-medium">Product image</p>
            <MediaPicker folder="creative" title="Choose a product image" triggerLabel={image ? "Change image" : "Choose image"} onSelect={(items) => items[0] && setImage({ path: items[0].path, url: items[0].url })} />
            {errors.imagePath ? <p className="mt-1 text-caption text-error">{errors.imagePath[0]}</p> : null}
          </div>
        ) : null}
        {t.spec.fields
          .filter((f) => f.key !== "image")
          .map((f) => (
            <TextField
              key={`${t.key}-${f.key}`}
              label={f.label}
              name={f.key}
              maxLength={f.max}
              placeholder={f.placeholder}
              value={values[f.key as FieldKey] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              errors={errors[f.key]}
              optional={!f.required}
            />
          ))}
        <TextField label="Save as" name="name" defaultValue={`${t.name} ${new Date().toLocaleDateString("en-IN")}`} maxLength={120} errors={errors.name} />
        {state && !state.ok ? <p role="alert" className="text-small text-error">{state.error.fieldErrors?._form?.[0] ?? state.error.message}</p> : null}
        {state?.ok ? (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">
            Saved to your media library (folder “creative”).
            {state.data.url ? (
              <a href={state.data.url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 underline">
                <Download className="size-3.5" aria-hidden /> Download PNG
              </a>
            ) : null}
            <a href="/dashboard/marketing/social" className="underline">Use in a social post</a>
          </p>
        ) : null}
        {canSave ? <SubmitButton size="sm">Render &amp; save PNG</SubmitButton> : <p className="text-small text-muted">You can preview designs but not save them.</p>}
      </form>
    </div>
  );
}
