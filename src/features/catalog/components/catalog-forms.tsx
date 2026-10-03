"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import {
  adjustStockAction,
  bulkProductsAction,
  deleteCategoryAction,
  deleteCollectionAction,
  deleteProductAction,
  deleteProductImageAction,
  deleteSizeChartAction,
  importProductsAction,
  previewRulesAction,
  reorderProductImagesAction,
  saveCategoryAction,
  saveCollectionAction,
  saveSizeChartAction,
  setStockAction,
  setThresholdAction,
  updateProductImageAction,
  uploadProductImageAction,
  attachProductMediaAction,
} from "@/features/catalog/actions";
import { MediaPicker } from "@/features/media/components/media-picker";
import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { CheckboxField, SelectField, TextAreaField, TextField, inputClassName as input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { FormMessage } from "@/components/ui/form";
import type { ProductMedia } from "@/features/catalog/types";
import type { CollectionCondition, CollectionRules } from "@/features/catalog/collection-rules";
import { ADJUST_REASONS, COLLECTION_SORTS, COLLECTION_SORT_LABELS, INVENTORY_REASON_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/features/catalog/constants";
import { DEFAULT_CHART, addColumn, addRow, removeColumn, removeRow, setCell, setColumnName, type SizeChartData } from "@/features/catalog/size-chart";

type Opt = { id: string; label: string };

/** File upload OR a media-library pick (sent as imagePath; the server verifies it's this store's image). */
function LibraryImageField({ inputId, folder }: { inputId: string; folder: string }) {
  const [picked, setPicked] = useState<{ path: string; url: string } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element -- small preview of the chosen library image
          <img src={picked.url} alt="" className="size-10 rounded-md object-cover ring-1 ring-border" />
        ) : null}
        <MediaPicker folder={folder} triggerLabel={picked ? "Change" : "Choose from library"} onSelect={([m]) => m && setPicked({ path: m.path, url: m.url })} />
        {picked ? (
          <button type="button" className="text-small text-muted hover:text-foreground" onClick={() => setPicked(null)}>
            Clear
          </button>
        ) : null}
      </div>
      {picked ? <input type="hidden" name="imagePath" value={picked.path} /> : <input id={inputId} name="file" type="file" accept="image/*" className="text-small" aria-label="Or upload a new image" />}
    </div>
  );
}

// ------------------------------------------------------------------ products

export function ProductMediaManager({ productId, media, variants }: { productId: string; media: ProductMedia[]; variants: Opt[] }) {
  const [order, setOrder] = useState(media.map((m) => m.id));
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(media.map((m) => [m.id, m]));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    const fd = new FormData();
    fd.set("productId", productId);
    next.forEach((id) => fd.append("ids[]", id));
    start(() => void reorderProductImagesAction(null, fd));
  };
  return (
    <Card title="Images" description="JPG, PNG, WebP or AVIF up to 10 MB. The first image is the main one.">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy={pending}>
        {order.map((id, i) => {
          const m = byId.get(id);
          if (!m) return null;
          return (
            <li key={id} className="space-y-2 rounded-md border border-border p-2">
              <div className="relative aspect-[3/4] overflow-hidden rounded bg-border/40">{m.url ? <Image src={m.url} alt={m.altText} fill sizes="200px" className="object-cover" /> : null}</div>
              <ActionForm action={updateProductImageAction} fields={{ id: m.id, productId }} submitLabel="Save" success="Saved." submitVariant="secondary">
                {() => (
                  <>
                    <TextField label="Alt text" name="altText" defaultValue={m.altText} maxLength={300} />
                    {variants.length > 1 ? (
                      <SelectField label="Show for variant" name="variantId" defaultValue={m.variantId ?? ""} options={[{ value: "", label: "All variants" }, ...variants.map((v) => ({ value: v.id, label: v.label }))]} />
                    ) : null}
                  </>
                )}
              </ActionForm>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                    ←
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Move later" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                    →
                  </Button>
                </span>
                <InlineAction action={deleteProductImageAction} fields={{ id: m.id, productId }} label="Delete" />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MediaPicker
          multiple
          folder="products"
          triggerLabel="Add from media library"
          onSelect={(items) => {
            setLibraryError(null);
            start(async () => {
              const r = await attachProductMediaAction(productId, items.map((m) => m.path));
              if (!r.ok) setLibraryError(r.error.message);
            });
          }}
        />
        {libraryError ? <p role="alert" className="text-small text-error">{libraryError}</p> : null}
      </div>
      <div className="mt-4">
        <ActionForm action={uploadProductImageAction} fields={{ productId }} submitLabel="Upload" success="Uploaded." encType="multipart/form-data" resetOnSuccess>
          {(e) => (
            <div>
              <label htmlFor="img-file" className="mb-1 block text-sm font-medium">
                Add images
              </label>
              <input id="img-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="text-sm" />
              {e.file ? <p className="mt-1 text-sm text-error">{e.file[0]}</p> : null}
            </div>
          )}
        </ActionForm>
      </div>
    </Card>
  );
}

export function DeleteProductButton({ id, hasOrders }: { id: string; hasOrders: boolean }) {
  return (
    <ActionDialog
      action={deleteProductAction}
      fields={{ id }}
      title="Delete this product?"
      description={hasOrders ? "This product has orders. Past orders keep their snapshot, but the product and its images are removed. Consider archiving instead." : "The product, its variants and images are permanently removed."}
      triggerLabel="Delete"
      confirmLabel="Delete product"
      variant="danger"
    />
  );
}

export function ProductBulkBar({ formId }: { formId: string }) {
  const [state, action, pending] = useActionState(bulkProductsAction, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="bulk-op" className="sr-only">
        Bulk action
      </label>
      <select id="bulk-op" name="op" form={formId} className={`${input} w-auto`} defaultValue="">
        <option value="" disabled>
          Bulk action…
        </option>
        <option value="publish">Publish</option>
        <option value="unpublish">Set to draft</option>
        <option value="archive">Archive</option>
        <option value="delete">Delete</option>
      </select>
      <Button size="sm" variant="secondary" pending={pending} onClick={() => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (form) action(new FormData(form));
      }}>
        Apply to selected
      </Button>
      {state?.ok ? <span role="status" className="text-sm text-success">{state.data.changed} updated{state.data.skipped ? `, ${state.data.skipped} skipped` : ""}.</span> : null}
      {state && !state.ok ? <span role="alert" className="text-sm text-error">{state.error.fieldErrors?.ids?.[0] ?? state.error.fieldErrors?.op?.[0] ?? state.error.message}</span> : null}
    </div>
  );
}

export function ImportProducts() {
  const [state, action, pending] = useActionState(importProductsAction, null);
  const [mode, setMode] = useState<"preview" | "apply">("preview");
  return (
    <form action={action} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="mode" value={mode} />
      <FormMessage state={state} />
      <label htmlFor="csv" className="block text-sm font-medium">
        Products CSV
      </label>
      <input id="csv" name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" pending={pending && mode === "preview"} onClick={() => setMode("preview")}>
          Preview
        </Button>
        <Button type="submit" pending={pending && mode === "apply"} onClick={() => setMode("apply")}>
          Import
        </Button>
      </div>
      {state?.ok ? (
        <div role="status" className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">{state.data.mode === "preview" ? "Preview: " : "Imported: "}{state.data.summary}</p>
          {state.data.errors.length ? (
            <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-xs text-error">
              {state.data.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- categories

export type CategoryValue = { id?: string; name: string; slug: string; description: string; parentId: string | null; status: string; position: number; seoTitle: string; seoDescription: string; imageUrl: string | null };

export function CategoryForm({ value, parents }: { value?: CategoryValue; parents: Opt[] }) {
  return (
    <ActionForm action={saveCategoryAction} fields={value?.id ? { id: value.id } : {}} submitLabel={value?.id ? "Save category" : "Add category"} success="Saved." encType="multipart/form-data" resetOnSuccess={!value?.id}>
      {(e) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" defaultValue={value?.name} required errors={e.name} />
          <TextField label="URL handle" name="slug" defaultValue={value?.slug} required errors={e.slug} hint="lowercase-with-hyphens" />
          <SelectField label="Parent" name="parentId" defaultValue={value?.parentId ?? ""} options={[{ value: "", label: "None (top level)" }, ...parents.filter((p) => p.id !== value?.id).map((p) => ({ value: p.id, label: p.label }))]} errors={e.parentId} />
          <SelectField label="Status" name="status" defaultValue={value?.status ?? "active"} options={[{ value: "active", label: "Visible" }, { value: "hidden", label: "Hidden" }]} />
          <TextField label="Position" name="position" type="number" min={0} defaultValue={value?.position ?? 0} />
          <div>
            <label htmlFor={`cat-img-${value?.id ?? "new"}`} className="mb-1.5 block text-sm font-medium">
              Image
            </label>
            <LibraryImageField folder="categories" inputId={`cat-img-${value?.id ?? "new"}`} />
            {value?.imageUrl ? <CheckboxField label="Remove current image" name="removeImage" value="true" className="mt-2" /> : null}
          </div>
          <TextAreaField label="Description" name="description" defaultValue={value?.description} className="sm:col-span-2" rows={3} />
          <TextField label="SEO title" name="seoTitle" defaultValue={value?.seoTitle} optional />
          <TextField label="SEO description" name="seoDescription" defaultValue={value?.seoDescription} optional />
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteCategory({ id, name }: { id: string; name: string }) {
  return <ActionDialog action={deleteCategoryAction} fields={{ id }} title={`Delete “${name}”?`} description="Products in it become uncategorised; subcategories move up a level." triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// --------------------------------------------------------------- collections

const RULE_FIELDS = [
  { value: "product_type", label: "Product type" },
  { value: "tag", label: "Tag" },
  { value: "category", label: "Category" },
  { value: "price", label: "Price (₹)" },
  { value: "on_sale", label: "On sale" },
  { value: "brand", label: "Brand" },
  { value: "attribute.fabric", label: "Fabric" },
  { value: "attribute.occasion", label: "Occasion" },
  { value: "attribute.style", label: "Style" },
] as const;

function defaultCondition(field: string, categories: Opt[]): CollectionCondition {
  switch (field) {
    case "product_type":
      return { field: "product_type", op: "eq", value: "kurta" } as CollectionCondition;
    case "category":
      return { field: "category", op: "eq", value: categories[0]?.id ?? "" } as CollectionCondition;
    case "price":
      return { field: "price", op: "lte", value: 1999 } as CollectionCondition;
    case "on_sale":
      return { field: "on_sale", op: "eq", value: true } as CollectionCondition;
    default:
      return { field, op: "eq", value: "" } as unknown as CollectionCondition;
  }
}

export type CollectionValue = { id?: string; title: string; slug: string; description: string; type: "manual" | "automated"; status: string; sortOrder: string; rules: CollectionRules; seoTitle: string; seoDescription: string; imageUrl: string | null; productIds: string[] };

export function CollectionForm({ value, categories, products }: { value: CollectionValue; categories: Opt[]; products: Opt[] }) {
  const [type, setType] = useState(value.type);
  const [rules, setRules] = useState<CollectionRules>(value.rules);
  const [selected, setSelected] = useState<string[]>(value.productIds);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [checking, start] = useTransition();
  const conds = rules.conditions as CollectionCondition[];
  const setCond = (i: number, c: CollectionCondition) => setRules({ ...rules, conditions: conds.map((x, j) => (j === i ? c : x)) as CollectionRules["conditions"] });
  return (
    <ActionForm action={saveCollectionAction} fields={{ ...(value.id ? { id: value.id } : {}), rules: JSON.stringify(rules) }} submitLabel={value.id ? "Save collection" : "Create collection"} encType="multipart/form-data">
      {(e) => (
        <div className="space-y-6">
          {type === "manual" ? selected.map((id) => <input key={id} type="hidden" name="productIds[]" value={id} />) : null}
          {type === "manual" ? <input type="hidden" name="productIdsPresent" value="1" /> : null}
          <Card title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Title" name="title" defaultValue={value.title} required errors={e.title} />
              <TextField label="URL handle" name="slug" defaultValue={value.slug} required errors={e.slug} />
              <SelectField label="Type" name="type" value={type} onChange={(ev) => setType(ev.target.value as "manual" | "automated")} options={[{ value: "manual", label: "Manual — pick products" }, { value: "automated", label: "Automated — by rules" }]} />
              <SelectField label="Status" name="status" defaultValue={value.status} options={[{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }]} />
              <SelectField label="Sort products by" name="sortOrder" defaultValue={value.sortOrder} options={COLLECTION_SORTS.map((s) => ({ value: s, label: COLLECTION_SORT_LABELS[s] }))} />
              <div>
                <label htmlFor="col-img" className="mb-1.5 block text-sm font-medium">
                  Image
                </label>
                <LibraryImageField folder="collections" inputId="col-img" />
                {value.imageUrl ? <CheckboxField label="Remove current image" name="removeImage" value="true" className="mt-2" /> : null}
              </div>
              <TextAreaField label="Description" name="description" defaultValue={value.description} rows={3} className="sm:col-span-2" />
              <TextField label="SEO title" name="seoTitle" defaultValue={value.seoTitle} optional />
              <TextField label="SEO description" name="seoDescription" defaultValue={value.seoDescription} optional />
            </div>
          </Card>
          {type === "automated" ? (
            <Card title="Rules" description="Active products matching these conditions appear automatically.">
              <div className="space-y-3">
                <SelectField label="Products must match" name="_match" value={rules.match} onChange={(ev) => setRules({ ...rules, match: ev.target.value as "all" | "any" })} options={[{ value: "all", label: "All conditions" }, { value: "any", label: "Any condition" }]} />
                {conds.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <select aria-label="Field" className={`${input} w-40`} value={c.field} onChange={(ev) => setCond(i, defaultCondition(ev.target.value, categories))}>
                      {RULE_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {c.field === "price" ? (
                      <select aria-label="Comparison" className={`${input} w-32`} value={c.op} onChange={(ev) => setCond(i, { ...c, op: ev.target.value } as CollectionCondition)}>
                        <option value="lte">at most</option>
                        <option value="gte">at least</option>
                      </select>
                    ) : (
                      <span className="pb-2 text-sm text-muted">is</span>
                    )}
                    {c.field === "product_type" ? (
                      <select aria-label="Value" className={`${input} w-44`} value={String(c.value)} onChange={(ev) => setCond(i, { ...c, value: ev.target.value } as CollectionCondition)}>
                        {PRODUCT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {PRODUCT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    ) : c.field === "category" ? (
                      <select aria-label="Value" className={`${input} w-44`} value={String(c.value)} onChange={(ev) => setCond(i, { ...c, value: ev.target.value } as CollectionCondition)}>
                        {categories.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    ) : c.field === "on_sale" ? (
                      <select aria-label="Value" className={`${input} w-32`} value={String(c.value)} onChange={(ev) => setCond(i, { ...c, value: ev.target.value === "true" } as CollectionCondition)}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input aria-label="Value" className={`${input} w-44`} value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value)} onChange={(ev) => setCond(i, { ...c, value: c.field === "price" ? Number(ev.target.value) || 0 : ev.target.value } as CollectionCondition)} />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setRules({ ...rules, conditions: conds.filter((_, j) => j !== i) as CollectionRules["conditions"] })}>
                      Remove
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setRules({ ...rules, conditions: [...conds, defaultCondition("tag", categories)] as CollectionRules["conditions"] })}>
                    Add condition
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    pending={checking}
                    onClick={() =>
                      start(async () => {
                        const r = await previewRulesAction(JSON.stringify(rules));
                        setPreview(r.ok ? `${r.data.total} matching products (${r.data.active} active)${r.data.sample.length ? `: ${r.data.sample.map((s) => s.title).join(", ")}` : ""}` : r.error.message);
                      })
                    }
                  >
                    Preview matches
                  </Button>
                </div>
                {preview ? <p role="status" className="text-sm text-muted">{preview}</p> : null}
                {e.rules ? <p className="text-sm text-error">{e.rules[0]}</p> : null}
              </div>
            </Card>
          ) : (
            <Card title={`Products (${selected.length})`}>
              <input aria-label="Filter products" placeholder="Filter products" className={`${input} mb-3`} value={filter} onChange={(ev) => setFilter(ev.target.value)} />
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {products
                  .filter((p) => !filter || p.label.toLowerCase().includes(filter.toLowerCase()))
                  .slice(0, 300)
                  .map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={(ev) => setSelected((s) => (ev.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                        {p.label}
                      </label>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Products appear in the order they were added. Selected products are listed first when sorted manually.</p>
            </Card>
          )}
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteCollection({ id }: { id: string }) {
  return <ActionDialog action={deleteCollectionAction} fields={{ id }} title="Delete this collection?" description="Products are not deleted." triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// --------------------------------------------------------------- size charts

export function SizeChartForm({ value }: { value?: { id: string; name: string; unit: "in" | "cm"; chart: SizeChartData } }) {
  const [chart, setChart] = useState<SizeChartData>(value?.chart ?? DEFAULT_CHART);
  return (
    <ActionForm action={saveSizeChartAction} fields={{ ...(value ? { id: value.id } : {}), chart: JSON.stringify(chart) }} submitLabel={value ? "Save chart" : "Create chart"} resetOnSuccess={!value}>
      {(e) => (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" name="name" defaultValue={value?.name} required errors={e.name} />
            <SelectField label="Unit" name="unit" defaultValue={value?.unit ?? "in"} options={[{ value: "in", label: "Inches" }, { value: "cm", label: "Centimetres" }]} />
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  {chart.columns.map((c, i) => (
                    <th key={i} className="p-1">
                      <input aria-label={`Column ${i + 1} name`} className={`${input} w-24`} value={c} onChange={(ev) => setChart(setColumnName(chart, i, ev.target.value))} />
                      {chart.columns.length > 1 ? (
                        <button type="button" className="text-xs text-muted" onClick={() => setChart(removeColumn(chart, i))}>
                          remove
                        </button>
                      ) : null}
                    </th>
                  ))}
                  <th>
                    <Button size="sm" variant="ghost" onClick={() => setChart(addColumn(chart))}>
                      + Column
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci} className="p-1">
                        <input aria-label={`Row ${ri + 1} ${chart.columns[ci] ?? ""}`} className={`${input} w-24`} value={cell} onChange={(ev) => setChart(setCell(chart, ri, ci, ev.target.value))} />
                      </td>
                    ))}
                    <td>
                      <button type="button" className="text-xs text-muted" onClick={() => setChart(removeRow(chart, ri))}>
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setChart(addRow(chart))}>
            + Row
          </Button>
          <TextField label="Note" name="_note" value={chart.note ?? ""} onChange={(ev) => setChart({ ...chart, note: ev.target.value })} optional />
          {e.chart ? <p className="text-sm text-error">{e.chart[0]}</p> : null}
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteSizeChart({ id, name }: { id: string; name: string }) {
  return <ActionDialog action={deleteSizeChartAction} fields={{ id }} title={`Delete “${name}”?`} description="Products using it will no longer show a size guide." triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// ----------------------------------------------------------------- inventory

export function StockActions({ variantId, available, threshold }: { variantId: string; available: number; threshold: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog action={adjustStockAction} fields={{ variantId }} title="Adjust stock" triggerLabel="Adjust" confirmLabel="Save" success="Stock updated.">
        {(e) => (
          <div className="space-y-3">
            <SelectField label="Change" name="direction" defaultValue="add" options={[{ value: "add", label: "Add stock" }, { value: "remove", label: "Remove stock" }]} />
            <TextField label="Quantity" name="quantity" type="number" min={1} required errors={e.quantity} />
            <SelectField label="Reason" name="reason" defaultValue="received" options={ADJUST_REASONS.map((r) => ({ value: r, label: INVENTORY_REASON_LABELS[r] ?? r }))} errors={e.reason} />
            <TextField label="Note" name="note" optional />
            {e._form ? <p className="text-sm text-error">{e._form[0]}</p> : null}
          </div>
        )}
      </ActionDialog>
      <ActionDialog action={setStockAction} fields={{ variantId }} title="Set stock count" description="Use after a physical count. The difference is recorded as a correction." triggerLabel="Set count" confirmLabel="Save" success="Stock updated.">
        {(e) => (
          <div className="space-y-3">
            <TextField label="Available" name="available" type="number" min={0} defaultValue={available} required errors={e.available} />
            <TextField label="Note" name="note" optional />
          </div>
        )}
      </ActionDialog>
      <ActionDialog action={setThresholdAction} fields={{ variantId }} title="Low-stock alert" triggerLabel="Alert level" confirmLabel="Save" success="Saved.">
        {(e) => <TextField label="Alert when available is at or below" name="threshold" type="number" min={0} defaultValue={threshold} errors={e.threshold} hint="Leave empty to use the store default." />}
      </ActionDialog>
    </div>
  );
}
