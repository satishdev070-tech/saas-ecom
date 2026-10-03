"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProductAction } from "@/features/catalog/actions";
import type { ProductDraft } from "@/features/catalog/types";
import type { OptionDraft, VariantDraft } from "@/features/catalog/variants";
import { cleanOptions, emptyVariant, generateVariantMatrix, slugify, suggestSku, variantTitle } from "@/features/catalog/variants";
import { OCCASIONS, OPTION_NAME_SUGGESTIONS, PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, PRODUCT_STATUSES, SIZE_PRESETS } from "@/features/catalog/constants";
import { Card } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { inputClassName as input } from "@/components/ui/field";

type Opt = { id: string; label: string };

function L({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

/**
 * Product editor. Holds the whole product as a draft object and submits it as one JSON
 * envelope (validated again on the server by productInputSchema, saved atomically by the
 * save_product RPC).
 */
export function ProductEditor({
  initial,
  categories,
  sizeCharts,
  collections,
  initialCollectionIds,
  canWriteInventory,
  stock,
}: {
  initial: ProductDraft;
  categories: Opt[];
  sizeCharts: Opt[];
  collections: Opt[];
  initialCollectionIds: string[];
  canWriteInventory: boolean;
  stock: Record<string, number>;
}) {
  const [d, setD] = useState<ProductDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [collectionIds, setCollectionIds] = useState<string[]>(initialCollectionIds);
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState(saveProductAction, null);
  const errors = state && !state.ok ? (state.error.fieldErrors ?? {}) : {};
  const errorList = Object.entries(errors).flatMap(([k, v]) => v.map((m) => (k === "_form" ? m : `${k}: ${m}`)));

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (patch: Partial<ProductDraft>) => {
    setDirty(true);
    setD((p) => ({ ...p, ...patch }));
  };
  const setOptions = (options: OptionDraft[]) => set({ options });
  const setVariant = (i: number, patch: Partial<VariantDraft>) => set({ variants: d.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const regenerate = () => {
    const options = cleanOptions(d.options);
    const base = d.variants[0] ?? emptyVariant();
    const next = options.length ? generateVariantMatrix(options, d.variants, { price: base.price, compareAtPrice: base.compareAtPrice, weightGrams: base.weightGrams }) : [d.variants[0] ?? emptyVariant()];
    set({ options, variants: next });
  };

  return (
    <form
      action={(fd) => {
        setDirty(false);
        action(fd);
      }}
      className="space-y-6"
    >
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      {collectionIds.map((id) => (
        <input key={id} type="hidden" name="collectionIds[]" value={id} />
      ))}
      {errorList.length ? (
        <div role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
          <p className="font-medium">{state && !state.ok ? state.error.message : ""}</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.slice(0, 12).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : state && !state.ok ? (
        <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{state.error.message}</p>
      ) : state?.ok ? (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">Saved.</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Basics">
            <div className="space-y-4">
              <div>
                <L htmlFor="p-title">Title</L>
                <input id="p-title" className={input} value={d.title} maxLength={200} required onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
              </div>
              <div>
                <L htmlFor="p-slug">URL handle</L>
                <input id="p-slug" className={input} value={d.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} />
                <p className="mt-1 text-xs text-muted">/products/{d.slug || "…"}</p>
              </div>
              <div>
                <L htmlFor="p-short">Short description</L>
                <input id="p-short" className={input} value={d.shortDescription} maxLength={500} onChange={(e) => set({ shortDescription: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-desc">Description</L>
                <textarea id="p-desc" className={input} rows={6} value={d.description} maxLength={20000} onChange={(e) => set({ description: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title="Options" description="Up to 3 options such as Size, Colour and Fabric. Variants are generated from every combination.">
            <div className="space-y-4">
              {d.options.map((o, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`o-${i}`}>
                      Option name
                    </label>
                    <input id={`o-${i}`} list="option-names" className={input} value={o.name} placeholder="Option name" onChange={(e) => setOptions(d.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Button variant="ghost" onClick={() => setOptions(d.options.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {o.values.map((v, k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm">
                        {/colou?r/i.test(o.name) ? (
                          <input
                            type="color"
                            aria-label={`${v.value} swatch`}
                            value={v.swatch || "#cccccc"}
                            onChange={(e) => setOptions(d.options.map((x, j) => (j === i ? { ...x, values: x.values.map((y, m) => (m === k ? { ...y, swatch: e.target.value } : y)) } : x)))}
                            className="size-5 cursor-pointer rounded-full border-0 p-0"
                          />
                        ) : null}
                        {v.value}
                        <button type="button" aria-label={`Remove ${v.value}`} onClick={() => setOptions(d.options.map((x, j) => (j === i ? { ...x, values: x.values.filter((_, m) => m !== k) } : x)))}>
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      aria-label={`Add ${o.name || "option"} value`}
                      placeholder="Add value + Enter"
                      className="min-w-32 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== ",") return;
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (!val || o.values.some((x) => x.value.toLowerCase() === val.toLowerCase())) return;
                        setOptions(d.options.map((x, j) => (j === i ? { ...x, values: [...x.values, { value: val, swatch: "" }] } : x)));
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                  {/size/i.test(o.name) ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(SIZE_PRESETS).map(([label, sizes]) => (
                        <button key={label} type="button" className="text-accent underline" onClick={() => setOptions(d.options.map((x, j) => (j === i ? { ...x, values: sizes.map((s) => ({ value: s, swatch: "" })) } : x)))}>
                          Use {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <datalist id="option-names">
                {OPTION_NAME_SUGGESTIONS.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-2">
                {d.options.length < 3 ? (
                  <Button variant="secondary" onClick={() => setOptions([...d.options, { name: d.options.length === 0 ? "Size" : d.options.length === 1 ? "Colour" : "Fabric", values: [] }])}>
                    Add option
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={regenerate}>
                  Generate variants
                </Button>
              </div>
            </div>
          </Card>

          <Card title={`Variants (${d.variants.length})`} description="Prices in ₹. MRP must be at least the price.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-2">Variant</th>
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2 pr-2">Price</th>
                    <th className="py-2 pr-2">MRP</th>
                    <th className="py-2 pr-2">Weight (g)</th>
                    <th className="py-2 pr-2">{d.id ? "Stock" : canWriteInventory ? "Opening stock" : "Stock"}</th>
                    <th className="py-2 pr-2">Track</th>
                    <th className="py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {d.variants.map((v, i) => (
                    <tr key={v.id ?? `new-${i}`} className="border-t border-border">
                      <td className="py-2 pr-2 font-medium">{variantTitle(v) || "Default"}</td>
                      <td className="py-2 pr-2">
                        <input aria-label="SKU" className={input} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} onFocus={() => !v.sku && d.slug && setVariant(i, { sku: suggestSku(d.slug, v) })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input aria-label="Price" inputMode="decimal" className={input} value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input aria-label="MRP" inputMode="decimal" className={input} value={v.compareAtPrice} onChange={(e) => setVariant(i, { compareAtPrice: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input aria-label="Weight in grams" inputMode="numeric" className={input} value={v.weightGrams} onChange={(e) => setVariant(i, { weightGrams: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        {v.id ? (
                          <span className="tabular-nums">{stock[v.id] ?? 0}</span>
                        ) : canWriteInventory ? (
                          <input aria-label="Opening stock" inputMode="numeric" className={input} value={v.initialStock} onChange={(e) => setVariant(i, { initialStock: e.target.value })} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <input type="checkbox" aria-label="Track inventory" checked={v.trackInventory} onChange={(e) => setVariant(i, { trackInventory: e.target.checked })} />
                      </td>
                      <td className="py-2">
                        <input type="checkbox" aria-label="Active" checked={v.status === "active"} onChange={(e) => setVariant(i, { status: e.target.checked ? "active" : "archived" })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.variants.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button type="button" className="text-accent underline" onClick={() => set({ variants: d.variants.map((v) => ({ ...v, price: d.variants[0]!.price, compareAtPrice: d.variants[0]!.compareAtPrice })) })}>
                  Copy first price & MRP to all
                </button>
              </div>
            ) : null}
          </Card>

          <Card title="Product details">
            <div className="grid gap-4 sm:grid-cols-2">
              {(["fabric", "style", "length", "work", "pattern"] as const).map((k) => (
                <div key={k}>
                  <L htmlFor={`a-${k}`}>{k[0]!.toUpperCase() + k.slice(1)}</L>
                  <input id={`a-${k}`} className={input} value={d.attributes[k]} maxLength={80} onChange={(e) => set({ attributes: { ...d.attributes, [k]: e.target.value } })} />
                </div>
              ))}
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Occasion</legend>
                <div className="flex flex-wrap gap-3">
                  {OCCASIONS.map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={d.attributes.occasion.includes(o)}
                        onChange={(e) => set({ attributes: { ...d.attributes, occasion: e.target.checked ? [...d.attributes.occasion, o] : d.attributes.occasion.filter((x) => x !== o) } })}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Specifications</legend>
                <p className="mb-2 text-xs text-muted">Shown in the product details. Use what matters for your category, e.g. Battery life, Material, Dimensions, Net weight, Skin type.</p>
                <div className="space-y-2">
                  {d.attributes.specs.map((sp, i) => (
                    <div key={i} className="flex gap-2">
                      <input aria-label={`Specification ${i + 1} label`} className={`${input} max-w-[40%]`} value={sp.label} maxLength={40} placeholder="Label" onChange={(e) => set({ attributes: { ...d.attributes, specs: d.attributes.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} />
                      <input aria-label={`Specification ${i + 1} value`} className={input} value={sp.value} maxLength={200} placeholder="Value" onChange={(e) => set({ attributes: { ...d.attributes, specs: d.attributes.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) } })} />
                      <button type="button" aria-label={`Remove specification ${i + 1}`} className="shrink-0 rounded-md px-2 text-sm text-muted hover:text-danger" onClick={() => set({ attributes: { ...d.attributes, specs: d.attributes.specs.filter((_, j) => j !== i) } })}>
                        ✕
                      </button>
                    </div>
                  ))}
                  {d.attributes.specs.length < 30 ? (
                    <button type="button" className="text-sm text-accent underline" onClick={() => set({ attributes: { ...d.attributes, specs: [...d.attributes.specs, { label: "", value: "" }] } })}>
                      Add specification
                    </button>
                  ) : null}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <L htmlFor="p-care">Fabric & care</L>
                <textarea id="p-care" rows={3} className={input} value={d.careInstructions} onChange={(e) => set({ careInstructions: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-ship">Shipping info</L>
                <textarea id="p-ship" rows={3} className={input} value={d.shippingInfo} onChange={(e) => set({ shippingInfo: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-ret">Returns info</L>
                <textarea id="p-ret" rows={3} className={input} value={d.returnInfo} onChange={(e) => set({ returnInfo: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title="Search engine listing">
            <div className="space-y-4">
              <div>
                <L htmlFor="p-seot">Page title</L>
                <input id="p-seot" className={input} value={d.seoTitle} maxLength={120} placeholder={d.title} onChange={(e) => set({ seoTitle: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-seod">Meta description</L>
                <textarea id="p-seod" rows={2} className={input} value={d.seoDescription} maxLength={320} placeholder={d.shortDescription} onChange={(e) => set({ seoDescription: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-seoc">Canonical URL (optional)</L>
                <input id="p-seoc" className={input} value={d.seoCanonical} maxLength={300} placeholder="Leave blank to use this product's own URL" onChange={(e) => set({ seoCanonical: e.target.value })} />
                <p className="mt-1 text-caption text-muted">Only set this when the same product is published at another URL you prefer search engines to index.</p>
              </div>
              <label className="flex items-center gap-2 text-small">
                <input type="checkbox" checked={d.seoNoindex} onChange={(e) => set({ seoNoindex: e.target.checked })} />
                Hide this product from search engines (noindex)
              </label>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status">
            <div className="space-y-3">
              <label htmlFor="p-status" className="sr-only">
                Status
              </label>
              <select id="p-status" className={input} value={d.status} onChange={(e) => set({ status: e.target.value as ProductDraft["status"] })}>
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.featured} onChange={(e) => set({ featured: e.target.checked })} /> Featured product
              </label>
              <Button type="submit" pending={pending} className="w-full">
                {d.id ? "Save product" : "Create product"}
              </Button>
              {dirty ? <p className="text-xs text-warning">Unsaved changes</p> : null}
            </div>
          </Card>
          <Card title="Organisation">
            <div className="space-y-4">
              <div>
                <L htmlFor="p-type">Product type</L>
                <select id="p-type" className={input} value={d.productType} onChange={(e) => set({ productType: e.target.value as ProductDraft["productType"] })}>
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PRODUCT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <L htmlFor="p-cat">Category</L>
                <select id="p-cat" className={input} value={d.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value || null })}>
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <L htmlFor="p-chart">Size chart</L>
                <select id="p-chart" className={input} value={d.sizeChartId ?? ""} onChange={(e) => set({ sizeChartId: e.target.value || null })}>
                  <option value="">None</option>
                  {sizeCharts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <L htmlFor="p-brand">Brand</L>
                <input id="p-brand" className={input} value={d.brand} onChange={(e) => set({ brand: e.target.value })} />
              </div>
              <div>
                <L htmlFor="p-tags">Tags</L>
                <input
                  id="p-tags"
                  className={input}
                  defaultValue={d.tags.join(", ")}
                  onBlur={(e) => set({ tags: [...new Set(e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))] })}
                />
                <p className="mt-1 text-xs text-muted">Comma separated. &quot;new&quot; and &quot;bestseller&quot; show badges.</p>
              </div>
              <div>
                <L htmlFor="p-hsn">HSN code</L>
                <input id="p-hsn" inputMode="numeric" className={input} value={d.hsnCode} onChange={(e) => set({ hsnCode: e.target.value })} />
              </div>
            </div>
          </Card>
          {collections.length ? (
            <Card title="Collections" description="Manual collections only; automated ones use rules.">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={collectionIds.includes(c.id)}
                      onChange={(e) => {
                        setDirty(true);
                        setCollectionIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)));
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </form>
  );
}
