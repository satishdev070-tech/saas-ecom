"use client";

import { useState, useTransition } from "react";
import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import { CheckboxField, SelectField, TextAreaField, TextField, inputClassName as input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { updateCustomerAction } from "@/features/customers/actions";
import { saveDiscountAction, toggleDiscountAction } from "@/features/marketing/actions";
import { moderateReviewAction } from "@/features/reviews/actions";
import { deleteDocumentAction, deleteRowAction, saveDocumentAction, saveMenuAction, saveRowAction, uploadContentImageAction } from "@/features/content/actions";
import {
  deletePincodeRuleAction,
  deleteShippingRateAction,
  resetNotificationTemplateAction,
  saveCodSettingsAction,
  saveNotificationTemplateAction,
  savePincodeRuleAction,
  saveShippingRateAction,
  saveStoreDetailsAction,
  saveTaxSettingsAction,
} from "@/features/settings/actions";
import type { ContentBlock } from "@/features/content/blocks";
import { assetUrl } from "@/lib/storage/assets";

type Opt = { id: string; label: string };

// ---------------------------------------------------------------- customers
export function CustomerEditForm({ id, tags, note, status }: { id: string; tags: string[]; note: string | null; status: string }) {
  return (
    <ActionForm action={updateCustomerAction} fields={{ id }} submitLabel="Save">
      {(e) => (
        <>
          <TextField label="Tags" name="tags" defaultValue={tags.join(", ")} hint="Comma separated, e.g. vip, wholesale" errors={e.tags} />
          <TextAreaField label="Internal note" name="note" defaultValue={note ?? ""} rows={3} errors={e.note} />
          <SelectField label="Status" name="status" defaultValue={status} options={[{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked (can't sign in or order)" }]} />
        </>
      )}
    </ActionForm>
  );
}

// ---------------------------------------------------------------- discounts
export type DiscountFormValue = {
  id?: string;
  title: string;
  method: "code" | "automatic";
  code: string;
  type: string;
  percent: string;
  amount: string;
  appliesTo: string;
  productIds: string[];
  collectionIds: string[];
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  enabled: boolean;
  buyQuantity: string;
  getQuantity: string;
  getPercent: string;
};

export function DiscountForm({ value, products, collections }: { value: DiscountFormValue; products: Opt[]; collections: Opt[] }) {
  const [type, setType] = useState(value.type);
  const [method, setMethod] = useState(value.method);
  const [applies, setApplies] = useState(value.appliesTo);
  return (
    <ActionForm action={saveDiscountAction} fields={value.id ? { id: value.id } : {}} submitLabel={value.id ? "Save discount" : "Create discount"}>
      {(e) => (
        <div className="space-y-6">
          <Card title="Discount">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Title" name="title" defaultValue={value.title} required errors={e.title} hint="Shown to shoppers at checkout." />
              <SelectField label="Method" name="method" value={method} onChange={(ev) => setMethod(ev.target.value as "code" | "automatic")} options={[{ value: "code", label: "Discount code" }, { value: "automatic", label: "Automatic" }]} />
              {method === "code" ? <TextField label="Code" name="code" defaultValue={value.code} errors={e.code} className="uppercase" /> : null}
              <SelectField
                label="Type"
                name="type"
                value={type}
                onChange={(ev) => setType(ev.target.value)}
                options={[{ value: "percentage", label: "Percentage off" }, { value: "fixed_amount", label: "Fixed amount off" }, { value: "free_shipping", label: "Free shipping" }, { value: "buy_x_get_y", label: "Buy X get Y" }]}
              />
              {type === "percentage" ? <TextField label="Percent off" name="percent" type="number" min={1} max={100} defaultValue={value.percent} errors={e.percent} /> : null}
              {type === "fixed_amount" ? <TextField label="Amount off (₹)" name="amount" inputMode="decimal" defaultValue={value.amount} errors={e.amount} /> : null}
              {type === "buy_x_get_y" ? (
                <>
                  <TextField label="Buy quantity" name="buyQuantity" type="number" min={1} defaultValue={value.buyQuantity} errors={e.buyQuantity} />
                  <TextField label="Get quantity" name="getQuantity" type="number" min={1} defaultValue={value.getQuantity} errors={e.getQuantity} />
                  <TextField label="Discount on those items (%)" name="getPercent" type="number" min={1} max={100} defaultValue={value.getPercent} errors={e.getPercent} />
                </>
              ) : null}
              {type === "percentage" ? <TextField label="Maximum discount (₹)" name="maxDiscount" inputMode="decimal" defaultValue={value.maxDiscount} optional errors={e.maxDiscount} /> : null}
            </div>
          </Card>
          <Card title="Eligibility">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Applies to" name="appliesTo" value={applies} onChange={(ev) => setApplies(ev.target.value)} options={[{ value: "all", label: "All products" }, { value: "products", label: "Specific products" }, { value: "collections", label: "Specific collections" }]} />
              <TextField label="Minimum order (₹)" name="minSubtotal" inputMode="decimal" defaultValue={value.minSubtotal} errors={e.minSubtotal} />
              {applies === "products" ? (
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1 text-sm font-medium">Products</legend>
                  <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="productIds[]" value={p.id} defaultChecked={value.productIds.includes(p.id)} /> {p.label}
                      </label>
                    ))}
                  </div>
                  {e.productIds ? <p className="text-sm text-error">{e.productIds[0]}</p> : null}
                </fieldset>
              ) : null}
              {applies === "collections" ? (
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1 text-sm font-medium">Collections</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {collections.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="collectionIds[]" value={c.id} defaultChecked={value.collectionIds.includes(c.id)} /> {c.label}
                      </label>
                    ))}
                  </div>
                  {e.collectionIds ? <p className="text-sm text-error">{e.collectionIds[0]}</p> : null}
                </fieldset>
              ) : null}
            </div>
          </Card>
          <Card title="Limits & schedule">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Starts" name="startsAt" type="datetime-local" defaultValue={value.startsAt} errors={e.startsAt} />
              <TextField label="Ends" name="endsAt" type="datetime-local" defaultValue={value.endsAt} optional errors={e.endsAt} />
              <TextField label="Total uses" name="usageLimit" type="number" min={1} defaultValue={value.usageLimit} optional errors={e.usageLimit} />
              <TextField label="Uses per customer" name="perCustomerLimit" type="number" min={1} defaultValue={value.perCustomerLimit} optional errors={e.perCustomerLimit} />
              <CheckboxField label="Enabled" name="enabled" value="true" defaultChecked={value.enabled} />
            </div>
          </Card>
        </div>
      )}
    </ActionForm>
  );
}

export function ToggleDiscount({ id, active }: { id: string; active: boolean }) {
  return <InlineAction action={toggleDiscountAction} fields={{ id, status: active ? "disabled" : "active" }} label={active ? "Disable" : "Enable"} />;
}

// ------------------------------------------------------------------ reviews
export function ReviewModeration({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "approved" ? <InlineAction action={moderateReviewAction} fields={{ id, op: "approved" }} label="Approve" variant="primary" /> : null}
      {status !== "rejected" ? <InlineAction action={moderateReviewAction} fields={{ id, op: "rejected" }} label="Reject" /> : null}
      <ActionDialog action={moderateReviewAction} fields={{ id, op: "delete" }} title="Delete this review?" triggerLabel="Delete" confirmLabel="Delete" variant="danger" />
    </div>
  );
}

// ------------------------------------------------------------ block editor
function BlockEditor({ blocks, onChange }: { blocks: ContentBlock[]; onChange: (b: ContentBlock[]) => void }) {
  const [uploading, start] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const update = (i: number, b: ContentBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...blocks];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    onChange(n);
  };
  const add = (b: ContentBlock) => onChange([...blocks, b]);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="uppercase tracking-wide">{b.type}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}>↑</Button>
              <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Remove</Button>
            </span>
          </div>
          {b.type === "heading" ? (
            <div className="flex gap-2">
              <select aria-label="Heading level" className={`${input} w-24`} value={b.level} onChange={(e) => update(i, { ...b, level: Number(e.target.value) as 2 | 3 | 4 })}>
                <option value={2}>H2</option>
                <option value={3}>H3</option>
                <option value={4}>H4</option>
              </select>
              <input aria-label="Heading" className={input} value={b.text} onChange={(e) => update(i, { ...b, text: e.target.value })} />
            </div>
          ) : b.type === "paragraph" || b.type === "quote" ? (
            <textarea aria-label={b.type} className={input} rows={4} value={b.text} onChange={(e) => update(i, { ...b, text: e.target.value })} />
          ) : b.type === "list" ? (
            <textarea aria-label="List items, one per line" className={input} rows={4} value={b.items.join("\n")} onChange={(e) => update(i, { ...b, items: e.target.value.split("\n") })} />
          ) : b.type === "button" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Button label" className={input} value={b.label} onChange={(e) => update(i, { ...b, label: e.target.value })} />
              <input aria-label="Link" className={input} value={b.href} placeholder="/collections/sale" onChange={(e) => update(i, { ...b, href: e.target.value })} />
            </div>
          ) : b.type === "image" ? (
            <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
              {assetUrl(b.path) ? (
                // eslint-disable-next-line @next/next/no-img-element -- editor thumbnail
                <img src={assetUrl(b.path)!} alt="" className="aspect-square w-full rounded object-cover" />
              ) : (
                <div className="aspect-square rounded bg-border/50" />
              )}
              <div className="space-y-2">
                <input aria-label="Alt text" className={input} placeholder="Describe the image" value={b.alt} onChange={(e) => update(i, { ...b, alt: e.target.value })} />
                <input aria-label="Caption" className={input} placeholder="Caption (optional)" value={b.caption ?? ""} onChange={(e) => update(i, { ...b, caption: e.target.value || undefined })} />
              </div>
            </div>
          ) : (
            <hr className="border-border" />
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => add({ type: "heading", level: 2, text: "Heading" })}>+ Heading</Button>
        <Button size="sm" variant="secondary" onClick={() => add({ type: "paragraph", text: "" } as ContentBlock)}>+ Paragraph</Button>
        <Button size="sm" variant="secondary" onClick={() => add({ type: "list", style: "bullet", items: [""] } as ContentBlock)}>+ List</Button>
        <Button size="sm" variant="secondary" onClick={() => add({ type: "quote", text: "" } as ContentBlock)}>+ Quote</Button>
        <Button size="sm" variant="secondary" onClick={() => add({ type: "button", label: "Shop now", href: "/", style: "primary" } as ContentBlock)}>+ Button</Button>
        <Button size="sm" variant="secondary" onClick={() => add({ type: "divider" })}>+ Divider</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-sm">
          {uploading ? "Uploading…" : "+ Image"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              start(async () => {
                const r = await uploadContentImageAction(fd);
                if (r.ok) {
                  setUploadError(null);
                  add({ type: "image", path: r.data.path, alt: "" } as ContentBlock);
                } else setUploadError(r.error.fieldErrors?.file?.[0] ?? r.error.message);
              });
              e.target.value = "";
            }}
          />
        </label>
        {uploadError ? <span role="alert" className="text-sm text-error">{uploadError}</span> : null}
      </div>
    </div>
  );
}

export type DocumentValue = { id?: string; title: string; slug: string; status: string; blocks: ContentBlock[]; seoTitle: string; seoDescription: string; kind?: string; excerpt?: string; authorName?: string; tags?: string; coverUrl?: string | null };

export function DocumentEditor({ table, value }: { table: "pages" | "blog_posts"; value: DocumentValue }) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(value.blocks);
  return (
    <ActionForm action={saveDocumentAction} fields={{ table, blocks: JSON.stringify(blocks), ...(value.id ? { id: value.id } : {}) }} submitLabel="Save" encType="multipart/form-data">
      {(e) => (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <TextField label="Title" name="title" defaultValue={value.title} required errors={e.title} />
            <Card title="Content">
              <BlockEditor blocks={blocks} onChange={setBlocks} />
              {e.blocks ? <p className="mt-2 text-sm text-error">{e.blocks[0]}</p> : null}
            </Card>
          </div>
          <div className="space-y-4">
            <SelectField label="Status" name="status" defaultValue={value.status} options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }]} />
            <TextField label="URL handle" name="slug" defaultValue={value.slug} required errors={e.slug} />
            {table === "pages" ? (
              <SelectField label="Page type" name="kind" defaultValue={value.kind ?? "page"} options={[{ value: "page", label: "Page" }, { value: "policy", label: "Policy" }, { value: "about", label: "About" }, { value: "contact", label: "Contact" }, { value: "faq", label: "FAQ" }]} />
            ) : (
              <>
                <TextAreaField label="Excerpt" name="excerpt" defaultValue={value.excerpt ?? ""} rows={3} />
                <TextField label="Author" name="authorName" defaultValue={value.authorName ?? ""} optional />
                <TextField label="Tags" name="tags" defaultValue={value.tags ?? ""} optional />
                <div>
                  <label htmlFor="cover" className="mb-1.5 block text-sm font-medium">Cover image</label>
                  <input id="cover" name="cover" type="file" accept="image/*" className="text-sm" />
                  {value.coverUrl ? <CheckboxField label="Remove cover" name="removeCover" value="true" className="mt-2" /> : null}
                </div>
              </>
            )}
            <TextField label="SEO title" name="seoTitle" defaultValue={value.seoTitle} optional />
            <TextAreaField label="SEO description" name="seoDescription" defaultValue={value.seoDescription} rows={2} optional />
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteDocument({ table, id }: { table: "pages" | "blog_posts"; id: string }) {
  return <ActionDialog action={deleteDocumentAction} fields={{ table, id }} title="Delete permanently?" triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// -------------------------------------------------------------- menu editor
type LinkTargets = Record<"collection" | "category" | "product" | "page" | "blog", Opt[]>;
type MenuLink = { title: string; link_type: string; link_ref: string | null; url: string | null; highlight: boolean; children?: MenuLink[] };

function LinkRow({ item, targets, onChange, onRemove }: { item: MenuLink; targets: LinkTargets; onChange: (m: MenuLink) => void; onRemove: () => void }) {
  const refList = (targets as Record<string, Opt[]>)[item.link_type];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Label" className={`${input} w-40`} value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} />
      <select aria-label="Link type" className={`${input} w-36`} value={item.link_type} onChange={(e) => onChange({ ...item, link_type: e.target.value, link_ref: null, url: e.target.value === "url" ? "/" : null })}>
        {["collection", "category", "product", "page", "blog", "url", "home", "search"].map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {refList ? (
        <select aria-label="Target" className={`${input} w-48`} value={item.link_ref ?? ""} onChange={(e) => onChange({ ...item, link_ref: e.target.value || null })}>
          <option value="">{item.link_type === "blog" ? "Journal index" : "Choose…"}</option>
          {refList.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      ) : item.link_type === "url" ? (
        <input aria-label="URL" className={`${input} w-48`} value={item.url ?? ""} placeholder="/pages/about or https://" onChange={(e) => onChange({ ...item, url: e.target.value })} />
      ) : null}
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={item.highlight} onChange={(e) => onChange({ ...item, highlight: e.target.checked })} /> Highlight
      </label>
      <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>
    </div>
  );
}

export function MenuEditor({ menu, targets }: { menu: { id?: string; handle: string; title: string; items: MenuLink[] }; targets: LinkTargets }) {
  const [items, setItems] = useState<MenuLink[]>(menu.items.map((i) => ({ ...i, children: i.children ?? [] })));
  const blank: MenuLink = { title: "New link", link_type: "collection", link_ref: null, url: null, highlight: false };
  return (
    <ActionForm action={saveMenuAction} fields={{ ...(menu.id ? { menuId: menu.id } : {}), items: JSON.stringify(items) }} submitLabel="Save menu">
      {(e) => (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Menu title" name="title" defaultValue={menu.title} required errors={e.title} />
            <TextField label="Handle" name="handle" defaultValue={menu.handle} readOnly={Boolean(menu.id)} errors={e.handle} hint="Used by the theme, e.g. main, footer" />
          </div>
          <ol className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="space-y-2 rounded-md border border-border p-3">
                <LinkRow item={it} targets={targets} onChange={(m) => setItems(items.map((x, j) => (j === i ? { ...m, children: x.children } : x)))} onRemove={() => setItems(items.filter((_, j) => j !== i))} />
                <ol className="space-y-2 border-l border-border pl-4">
                  {(it.children ?? []).map((c, k) => (
                    <li key={k}>
                      <LinkRow item={c} targets={targets} onChange={(m) => setItems(items.map((x, j) => (j === i ? { ...x, children: (x.children ?? []).map((y, n) => (n === k ? m : y)) } : x)))} onRemove={() => setItems(items.map((x, j) => (j === i ? { ...x, children: (x.children ?? []).filter((_, n) => n !== k) } : x)))} />
                    </li>
                  ))}
                </ol>
                <Button size="sm" variant="ghost" onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, children: [...(x.children ?? []), blank] } : x)))}>+ Sub-link</Button>
              </li>
            ))}
          </ol>
          <Button size="sm" variant="secondary" onClick={() => setItems([...items, { ...blank, children: [] }])}>+ Link</Button>
          {e.items ? <p className="text-sm text-error">{e.items[0]}</p> : null}
        </div>
      )}
    </ActionForm>
  );
}

// ------------------------------------------------------------ simple rows
export function RowForm({ kind, value = {} }: { kind: "faq" | "location" | "redirect"; value?: Record<string, string | number | boolean | null | undefined> }) {
  const v = (k: string) => (value[k] === null || value[k] === undefined ? "" : String(value[k]));
  return (
    <ActionForm action={saveRowAction} fields={{ kind, ...(value.id ? { id: String(value.id) } : {}) }} submitLabel={value.id ? "Save" : "Add"} resetOnSuccess={!value.id}>
      {(e) =>
        kind === "faq" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Question" name="question" defaultValue={v("question")} required errors={e.question} className="sm:col-span-2" />
            <TextAreaField label="Answer" name="answer" defaultValue={v("answer")} required errors={e.answer} rows={3} className="sm:col-span-2" />
            <TextField label="Group" name="groupName" defaultValue={v("group_name") || "General"} />
            <TextField label="Position" name="position" type="number" defaultValue={v("position") || "0"} />
            <CheckboxField label="Published" name="published" value="true" defaultChecked={value.status !== "draft"} />
          </div>
        ) : kind === "location" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" name="name" defaultValue={v("name")} required errors={e.name} />
            <TextField label="Phone" name="phone" defaultValue={v("phone")} optional />
            <TextField label="Address" name="line1" defaultValue={v("line1")} className="sm:col-span-2" />
            <TextField label="City" name="city" defaultValue={v("city")} />
            <TextField label="State" name="state" defaultValue={v("state")} />
            <TextField label="PIN code" name="postalCode" defaultValue={v("postal_code")} errors={e.postalCode} />
            <TextField label="Hours" name="hours" defaultValue={v("hours")} placeholder="Mon–Sat 11am–8pm" />
            <TextField label="Latitude" name="latitude" defaultValue={v("latitude")} optional />
            <TextField label="Longitude" name="longitude" defaultValue={v("longitude")} optional />
            <CheckboxField label="Show on store locator" name="active" value="true" defaultChecked={value.active !== false} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Old path" name="fromPath" defaultValue={v("from_path")} placeholder="/old-kurtas" required errors={e.fromPath} />
            <TextField label="Redirect to" name="toPath" defaultValue={v("to_path")} placeholder="/collections/kurtas" required errors={e.toPath} />
            <SelectField label="Type" name="statusCode" defaultValue={v("status_code") || "301"} options={[{ value: "301", label: "Permanent (301)" }, { value: "302", label: "Temporary (302)" }]} />
          </div>
        )
      }
    </ActionForm>
  );
}

export function DeleteRow({ kind, id }: { kind: "faq" | "location" | "redirect" | "menu"; id: string }) {
  return <ActionDialog action={deleteRowAction} fields={{ kind, id }} title="Delete this item?" triggerLabel="Delete" confirmLabel="Delete" variant="danger" />;
}

// ----------------------------------------------------------------- settings
export function StoreDetailsForm({ v, logoUrl, faviconUrl }: { v: Record<string, string>; logoUrl: string | null; faviconUrl: string | null }) {
  return (
    <ActionForm action={saveStoreDetailsAction} submitLabel="Save store details" encType="multipart/form-data">
      {(e) => (
        <div className="space-y-6">
          <Card title="Brand">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Store name" name="name" defaultValue={v.name} required errors={e.name} />
              <TextField label="Tagline" name="tagline" defaultValue={v.tagline} optional />
              <TextAreaField label="About the store" name="description" defaultValue={v.description} rows={3} className="sm:col-span-2" />
              <div>
                <label htmlFor="logo" className="mb-1.5 block text-sm font-medium">Logo</label>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- current logo preview
                  <img src={logoUrl} alt="Current logo" className="mb-2 h-10 w-auto" />
                ) : null}
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
                {logoUrl ? <CheckboxField label="Remove logo" name="removeLogo" value="true" className="mt-2" /> : null}
                {e.file ? <p className="text-sm text-error">{e.file[0]}</p> : null}
              </div>
              <div>
                <label htmlFor="favicon" className="mb-1.5 block text-sm font-medium">Favicon</label>
                {faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- current favicon preview
                  <img src={faviconUrl} alt="Current favicon" className="mb-2 size-8" />
                ) : null}
                <input id="favicon" name="favicon" type="file" accept="image/png,image/webp" className="text-sm" />
                {faviconUrl ? <CheckboxField label="Remove favicon" name="removeFavicon" value="true" className="mt-2" /> : null}
              </div>
            </div>
          </Card>
          <Card title="Contact & address">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Email" name="email" type="email" defaultValue={v.email} errors={e.email} />
              <TextField label="Phone" name="phone" defaultValue={v.phone} errors={e.phone} />
              <TextField label="WhatsApp" name="whatsapp" defaultValue={v.whatsapp} errors={e.whatsapp} optional />
              <TextField label="Address line 1" name="addressLine1" defaultValue={v.addressLine1} />
              <TextField label="Address line 2" name="addressLine2" defaultValue={v.addressLine2} optional />
              <TextField label="City" name="city" defaultValue={v.city} />
              <TextField label="State" name="state" defaultValue={v.state} />
              <TextField label="PIN code" name="postalCode" defaultValue={v.postalCode} errors={e.postalCode} />
            </div>
          </Card>
          <Card title="Business & invoices">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Legal name" name="legalName" defaultValue={v.legalName} optional />
              <TextField label="GSTIN" name="gstin" defaultValue={v.gstin} errors={e.gstin} optional />
              <TextField label="Order number prefix" name="orderPrefix" defaultValue={v.orderPrefix} errors={e.orderPrefix} />
              <TextField label="Default low-stock alert" name="lowStockDefault" type="number" min={0} defaultValue={v.lowStockDefault} errors={e.lowStockDefault} />
            </div>
          </Card>
          <Card title="Social profiles" description={<>Search engine settings live in <a href="/dashboard/settings/seo" className="text-accent hover:underline">SEO</a>; analytics tags in <a href="/dashboard/settings/analytics" className="text-accent hover:underline">Analytics &amp; tracking</a>.</>}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["instagram", "facebook", "youtube", "pinterest", "x"] as const).map((k) => (
                <TextField key={k} label={k === "x" ? "X (Twitter)" : k[0]!.toUpperCase() + k.slice(1)} name={k} defaultValue={v[k]} placeholder="https://" errors={e[k]} optional />
              ))}
            </div>
          </Card>
        </div>
      )}
    </ActionForm>
  );
}

export function ShippingRateForm({ value = {} }: { value?: Record<string, string | boolean | number | null> }) {
  const s = (k: string) => (value[k] === null || value[k] === undefined ? "" : String(value[k]));
  return (
    <ActionForm action={saveShippingRateAction} fields={value.id ? { id: String(value.id) } : {}} submitLabel={value.id ? "Save rate" : "Add rate"} resetOnSuccess={!value.id}>
      {(e) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Name" name="name" defaultValue={s("name")} required errors={e.name} />
          <TextField label="Price (₹)" name="price" inputMode="decimal" defaultValue={s("price") || "0"} errors={e.price} />
          <TextField label="Min order (₹)" name="minSubtotal" inputMode="decimal" defaultValue={s("min_subtotal") || "0"} errors={e.minSubtotal} />
          <TextField label="Max order (₹)" name="maxSubtotal" inputMode="decimal" defaultValue={s("max_subtotal")} optional errors={e.maxSubtotal} />
          <TextField label="Days (min)" name="daysMin" type="number" defaultValue={s("estimated_days_min") || "3"} />
          <TextField label="Days (max)" name="daysMax" type="number" defaultValue={s("estimated_days_max") || "7"} errors={e.daysMax} />
          <TextField label="Only these PIN prefixes" name="pincodePrefixes" defaultValue={Array.isArray(value.pincode_prefixes) ? (value.pincode_prefixes as unknown as string[]).join(", ") : ""} hint="Blank = all India" errors={e.pincodePrefixes} className="sm:col-span-2" />
          <TextField label="Position" name="position" type="number" defaultValue={s("position") || "0"} />
          <CheckboxField label="COD allowed" name="codAllowed" value="true" defaultChecked={value.cod_allowed !== false} />
          <CheckboxField label="Active" name="active" value="true" defaultChecked={value.active !== false} />
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteShippingRate({ id }: { id: string }) {
  return <InlineAction action={deleteShippingRateAction} fields={{ id }} label="Delete" />;
}

export function PincodeRuleForm() {
  return (
    <ActionForm action={savePincodeRuleAction} submitLabel="Save rule" resetOnSuccess>
      {(e) => (
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label="PIN prefix" name="prefix" placeholder="e.g. 7911" required errors={e.prefix} />
          <TextField label="Extra days" name="extraDays" type="number" min={0} defaultValue="0" />
          <CheckboxField label="Deliverable" name="deliverable" value="true" defaultChecked />
          <CheckboxField label="COD allowed" name="codAllowed" value="true" defaultChecked />
        </div>
      )}
    </ActionForm>
  );
}

export function DeletePincodeRule({ prefix }: { prefix: string }) {
  return <InlineAction action={deletePincodeRuleAction} fields={{ prefix }} label="Delete" />;
}

export function CodForm({ v }: { v: { enabled: boolean; fee: string; minOrder: string; maxOrder: string } }) {
  return (
    <ActionForm action={saveCodSettingsAction} submitLabel="Save COD settings">
      {(e) => (
        <div className="grid gap-3 sm:grid-cols-4">
          <CheckboxField label="Offer cash on delivery" name="enabled" value="true" defaultChecked={v.enabled} className="sm:col-span-4" />
          <TextField label="COD fee (₹)" name="fee" inputMode="decimal" defaultValue={v.fee} errors={e.fee} />
          <TextField label="Min order (₹)" name="minOrder" inputMode="decimal" defaultValue={v.minOrder} errors={e.minOrder} />
          <TextField label="Max order (₹)" name="maxOrder" inputMode="decimal" defaultValue={v.maxOrder} hint="0 = no limit" errors={e.maxOrder} />
        </div>
      )}
    </ActionForm>
  );
}

export function TaxForm({ v }: { v: { pricesIncludeTax: boolean; threshold: string; lower: string; upper: string } }) {
  return (
    <ActionForm action={saveTaxSettingsAction} submitLabel="Save tax settings">
      {(e) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckboxField label="Prices include GST (MRP-inclusive pricing)" name="pricesIncludeTax" value="true" defaultChecked={v.pricesIncludeTax} className="sm:col-span-3" />
          <TextField label="Price threshold per item (₹)" name="thresholdRupees" type="number" min={0} defaultValue={v.threshold} errors={e.thresholdRupees} hint="0 = single rate" />
          <TextField label="GST at or below threshold (%)" name="lowerRate" type="number" min={0} max={28} defaultValue={v.lower} errors={e.lowerRate} />
          <TextField label="GST above threshold (%)" name="upperRate" type="number" min={0} max={28} defaultValue={v.upper} errors={e.upperRate} />
        </div>
      )}
    </ActionForm>
  );
}

export function TemplateForm({ tkey, subject, body, active, custom, variables }: { tkey: string; subject: string; body: string; active: boolean; custom: boolean; variables: string[] }) {
  return (
    <div className="space-y-3">
      <ActionForm action={saveNotificationTemplateAction} fields={{ key: tkey, channel: "email" }} submitLabel="Save template">
        {(e) => (
          <>
            <TextField label="Subject" name="subject" defaultValue={subject} errors={e.subject} />
            <TextAreaField label="Message" name="body" defaultValue={body} rows={8} errors={e.body} hint={`Variables: ${variables.map((x) => `{{${x}}}`).join(" ")}`} />
            <CheckboxField label="Send this email" name="active" value="true" defaultChecked={active} />
          </>
        )}
      </ActionForm>
      {custom ? <InlineAction action={resetNotificationTemplateAction} fields={{ key: tkey }} label="Reset to default" /> : null}
    </div>
  );
}
