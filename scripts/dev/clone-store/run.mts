/**
 * Creates the store "Ramya By Ayushi Paliya" (slug ramya-by-ayushi-paliya), owned by
 * admin@paliya.test, and copies The Paliya's catalogue, media and content into it.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/clone-store/run.mts
 *
 * SAFETY
 *  - The source tenant (The Paliya) is only READ (GET). Every write goes through `write()`, which
 *    refuses any path or body that mentions the source tenant id. The one exception is a storage
 *    COPY (`copyObject`) whose source key must be under tenant/<source>/ and destination under
 *    tenant/<new>/.
 *  - If the slug already exists, it must be owned by admin@paliya.test (and not be the source);
 *    then the run resumes idempotently (existing rows matched by slug/handle/path are skipped).
 *  - The owner's session comes from a one-time magic link; no account is created, no password used.
 *  - Not copied: reviews, orders, customers, discounts, integrations, theme versions, domains.
 */
import { dbToDraft, type DbOption, type DbOptionValue, type DbProduct, type DbVariant } from "../../../src/features/catalog/draft";
import { productInputSchema, toSaveProductPayload } from "../../../src/features/catalog/schemas";

const env = (n: string) => {
  const v = process.env[n] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUB = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const ROOT = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? "localhost";
if (!URL_ || !SECRET || !PUB) throw new Error("Supabase env vars are required");

const SOURCE = "71458ab4-6b05-4798-bc95-acfe1fd15420";
const NAME = "Ramya By Ayushi Paliya";
const SLUG = "ramya-by-ayushi-paliya";
const OWNER_EMAIL = "admin@paliya.test";
const BUCKET = "store-assets";

// ------------------------------------------------------------------ HTTP

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: opts.token ? PUB : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: opts.prefer ?? "return=representation" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Read-only. */
async function get<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`GET ${path.split("?")[0]} → ${res.status} ${(await res.text()).slice(0, 300)}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

let NEW = ""; // set once the target tenant id is known

/** The ONLY way this script writes rows. Refuses anything that references the source tenant. */
async function write<T = unknown>(method: "POST" | "PATCH", path: string, body: unknown, token?: string, verifiedInNew = false): Promise<T> {
  const blob = `${path} ${JSON.stringify(body ?? null)}`;
  if (blob.includes(SOURCE)) throw new Error(`SAFETY: write to ${path.split("?")[0]} references the source tenant`);
  if (path.startsWith("/rest/v1/rpc/create_tenant")) return http<T>(method, path, { body, token });
  if (!NEW || (!blob.includes(NEW) && !verifiedInNew)) throw new Error(`SAFETY: write to ${path.split("?")[0]} is not scoped to the new tenant`);
  return http<T>(method, path, { body, token });
}
const insert = <T = Record<string, unknown>,>(table: string, rows: unknown) => write<T[]>("POST", `/rest/v1/${table}`, rows);

/** Storage copy: source under tenant/<source>/, destination under tenant/<new>/ only. */
async function copyObject(sourceKey: string, destinationKey: string): Promise<"copied" | "exists" | "missing"> {
  if (!NEW || !sourceKey.startsWith(`tenant/${SOURCE}/`) || !destinationKey.startsWith(`tenant/${NEW}/`) || destinationKey.includes(SOURCE)) {
    throw new Error(`SAFETY: bad copy ${sourceKey} → ${destinationKey}`);
  }
  const res = await fetch(`${URL_}/storage/v1/object/copy`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: BUCKET, sourceKey, destinationKey }),
  });
  if (res.ok) return "copied";
  const t = await res.text();
  if (/already exists|Duplicate|409/i.test(t)) return "exists";
  if (/not.?found|404/i.test(t)) return "missing";
  throw new Error(`copy ${sourceKey} → ${res.status} ${t.slice(0, 300)}`);
}

// ------------------------------------------------------------------ helpers

const SRC_PREFIX = `tenant/${SOURCE}/`;
const paths = new Set<string>(); // every source storage key referenced by copied data
/** Deep-rewrites tenant/<source>/… storage paths to tenant/<new>/… (recording them for copy) and remaps ids. */
function rewrite(v: unknown, ids: Map<string, string>): unknown {
  if (typeof v === "string") {
    if (ids.has(v)) return ids.get(v);
    if (v.includes(SRC_PREFIX)) {
      for (const m of v.matchAll(new RegExp(`${SRC_PREFIX}[^\\s"')]+`, "g"))) paths.add(m[0]);
      return v.replaceAll(SRC_PREFIX, `tenant/${NEW}/`);
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => rewrite(x, ids));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x, ids)]));
  return v;
}
const pick = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
const S = `tenant_id=eq.${SOURCE}`;

// ------------------------------------------------------------------ owner + tenant

async function ownerSession(): Promise<{ token: string; userId: string }> {
  let user: { id: string; email?: string } | undefined;
  for (let page = 1; !user; page++) {
    const r = await http<{ users: { id: string; email?: string }[] }>("GET", `/auth/v1/admin/users?page=${page}&per_page=200`);
    user = r.users.find((u) => u.email === OWNER_EMAIL);
    if (r.users.length < 200) break;
  }
  if (!user) throw new Error(`${OWNER_EMAIL} does not exist (this script never creates accounts)`);
  const link = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email: OWNER_EMAIL } });
  const res = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.properties?.hashed_token ?? link.hashed_token }) });
  const j = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!j.access_token || j.user?.id !== user.id) throw new Error("magic-link session failed");
  return { token: j.access_token, userId: user.id };
}

const owner = await ownerSession();
const existing = await get<{ id: string }>(`tenants?select=id&slug=eq.${SLUG}`);
if (existing[0]) {
  const id = existing[0].id;
  if (id === SOURCE) throw new Error("ABORT: slug resolves to the source tenant");
  const owners = await get<{ user_id: string }>(`tenant_memberships?select=user_id&tenant_id=eq.${id}&role=eq.owner`);
  if (!owners.some((o) => o.user_id === owner.userId)) throw new Error(`ABORT: ${SLUG} exists but isn't owned by ${OWNER_EMAIL}`);
  NEW = id;
  console.log(`↻ resuming ${NAME} (${NEW})`);
} else {
  NEW = await write<string>("POST", "/rest/v1/rpc/create_tenant", { p_name: NAME, p_slug: SLUG, p_root_domain: ROOT }, owner.token);
  console.log(`▶ created ${NAME} (${NEW})`);
}
if (!/^[0-9a-f-]{36}$/.test(NEW) || NEW === SOURCE) throw new Error("ABORT: bad target tenant id");
const N = `tenant_id=eq.${NEW}`;
const ids = new Map<string, string>(); // source id → new id (categories, collections, size charts, products, variants, pages, menus, menu items)

// Tenant: active, plan copied from the source. store_type left at its default (real).
const [srcTenant] = await get<{ plan_id: string | null }>(`tenants?select=plan_id&id=eq.${SOURCE}`);
await write("PATCH", `/rest/v1/tenants?id=eq.${NEW}`, { status: "active", trial_ends_at: null, plan_id: srcTenant!.plan_id });
try {
  const [fashion] = await get<{ id: string }>("store_categories?select=id&slug=eq.fashion");
  if (fashion) await write("PATCH", `/rest/v1/stores?${N}`, { category_id: fashion.id });
} catch {
  console.log("  (category not set: migration 1800 not applied)");
}

// ------------------------------------------------------------------ store profile

const [srcStore] = await get<Record<string, unknown>>(`stores?select=*&${S}`);
const seo = { ...((srcStore!.seo as Record<string, unknown>) ?? {}) };
for (const k of Object.keys(seo)) if (typeof seo[k] === "string") seo[k] = (seo[k] as string).replaceAll("Ramya Glamorous", NAME);
await write(
  "PATCH",
  `/rest/v1/stores?${N}`,
  rewrite({ name: NAME, ...pick(srcStore!, ["tagline", "description", "email", "phone", "whatsapp", "address", "social", "legal_name", "logo_path", "favicon_path"]), seo }, ids),
);

// ------------------------------------------------------------------ size charts, categories, collections

const srcCharts = await get<Record<string, unknown>>(`size_charts?select=*&${S}&order=created_at`);
const newCharts = await get<{ id: string; name: string }>(`size_charts?select=id,name&${N}`);
for (const c of srcCharts) {
  const have = newCharts.find((x) => x.name === c.name);
  const id = have?.id ?? (await insert<{ id: string }>("size_charts", { tenant_id: NEW, ...pick(c, ["name", "unit", "chart"]) }))[0]!.id;
  ids.set(c.id as string, id);
}

const srcCats = await get<Record<string, unknown> & { id: string; slug: string; parent_id: string | null }>(`categories?select=*&${S}&order=position`);
const newCats = await get<{ id: string; slug: string }>(`categories?select=id,slug&${N}`);
for (const c of newCats) {
  const src = srcCats.find((x) => x.slug === c.slug);
  if (src) ids.set(src.id, c.id);
}
// Insert parents before children (any depth).
for (let pending = srcCats.filter((c) => !ids.has(c.id)); pending.length; ) {
  const ready = pending.filter((c) => !c.parent_id || ids.has(c.parent_id));
  if (!ready.length) throw new Error("category hierarchy has a cycle or a missing parent");
  const made = await insert<{ id: string; slug: string }>(
    "categories",
    ready.map((c) => ({ tenant_id: NEW, ...(rewrite(pick(c, ["name", "slug", "description", "image_path", "seo", "position", "status"]), ids) as object), parent_id: c.parent_id ? ids.get(c.parent_id) : null })),
  );
  for (const m of made) ids.set(ready.find((c) => c.slug === m.slug)!.id, m.id);
  pending = pending.filter((c) => !ids.has(c.id));
}

const srcCols = await get<Record<string, unknown> & { id: string; slug: string; type: string }>(`collections?select=*&${S}&order=position`);
const newCols = await get<{ id: string; slug: string }>(`collections?select=id,slug&${N}`);
for (const c of srcCols) {
  const have = newCols.find((x) => x.slug === c.slug);
  const id = have?.id ?? (await insert<{ id: string }>("collections", { tenant_id: NEW, ...(rewrite(pick(c, ["title", "slug", "description", "image_path", "type", "rules", "sort_order", "seo", "status", "position", "published_at"]), ids) as object) }))[0]!.id;
  ids.set(c.id, id);
}
// Collection rules may reference category ids: remap now that every category exists.
for (const c of srcCols) {
  const rules = rewrite(c.rules, ids);
  if (JSON.stringify(rules) !== JSON.stringify(c.rules)) await write("PATCH", `/rest/v1/collections?id=eq.${ids.get(c.id)}&${N}`, { rules });
}

// ------------------------------------------------------------------ products

const srcProducts = await get<DbProduct>(`products?select=id,updated_at,title,slug,description,short_description,product_type,brand,category_id,size_chart_id,status,featured,tags,attributes,care_instructions,shipping_info,return_info,hsn_code,seo&${S}&order=created_at`);
const srcOptions = await get<DbOption>(`product_options?select=id,product_id,position,name&${S}`);
const srcValues = await get<DbOptionValue>(`product_option_values?select=option_id,value,swatch,position&${S}`);
const srcVariants = await get<DbVariant>(`product_variants?select=id,product_id,option1,option2,option3,sku,barcode,price,compare_at_price,cost_price,weight_grams,track_inventory,allow_backorder,low_stock_threshold,status,position&${S}`);
const srcLevels = await get<{ variant_id: string; available: number }>(`inventory_levels?select=variant_id,available&${S}`);
const stock = new Map<string, number>();
for (const l of srcLevels) stock.set(l.variant_id, (stock.get(l.variant_id) ?? 0) + l.available);

const comboKey = (v: { option1: string | null; option2: string | null; option3: string | null }) => [v.option1, v.option2, v.option3].map((x) => x ?? "").join("|");
const newProducts = await get<{ id: string; slug: string }>(`products?select=id,slug&${N}`);
const failed: string[] = [];
let created = 0;
for (const p of srcProducts) {
  let newId = newProducts.find((x) => x.slug === p.slug)?.id;
  if (!newId) {
    const draft = dbToDraft(p, srcOptions.filter((o) => o.product_id === p.id), srcValues, srcVariants.filter((v) => v.product_id === p.id));
    const srcVs = srcVariants.filter((v) => v.product_id === p.id);
    const parsed = productInputSchema.safeParse({
      ...draft,
      id: undefined,
      expectedUpdatedAt: undefined,
      categoryId: p.category_id ? (ids.get(p.category_id) ?? null) : null,
      sizeChartId: p.size_chart_id ? (ids.get(p.size_chart_id) ?? null) : null,
      variants: draft.variants.map((v) => ({ ...v, id: undefined, initialStock: String(Math.max(0, stock.get(srcVs.find((s) => s.id === v.id)!.id) ?? 0)) })),
    });
    if (!parsed.success) {
      failed.push(`${p.slug}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    newId = await write<string>("POST", "/rest/v1/rpc/save_product", { p_tenant: NEW, p_payload: toSaveProductPayload(parsed.data, { allowInitialStock: true }) }, owner.token);
    created++;
  }
  ids.set(p.id, newId);
  const nv = await get<{ id: string; option1: string | null; option2: string | null; option3: string | null }>(`product_variants?select=id,option1,option2,option3&product_id=eq.${newId}&${N}`);
  for (const v of srcVariants.filter((x) => x.product_id === p.id)) {
    const m = nv.find((x) => comboKey(x) === comboKey(v));
    if (m) ids.set(v.id, m.id);
  }
}
console.log(`  products: ${created} created, ${srcProducts.length - created - failed.length} already present${failed.length ? `, ${failed.length} FAILED` : ""}`);
failed.forEach((f) => console.log("   ✗", f));

// Manual collection membership (replaces this new collection's members; source order kept).
const srcMembers = await get<{ collection_id: string; product_id: string; position: number }>(`collection_products?select=collection_id,product_id,position&${S}&order=position`);
for (const c of srcCols.filter((x) => x.type === "manual")) {
  const pids = srcMembers.filter((m) => m.collection_id === c.id).map((m) => ids.get(m.product_id)).filter((x): x is string => !!x);
  if (!pids.length) continue;
  const colId = ids.get(c.id)!;
  // The RPC body has no tenant id: prove the collection belongs to the new tenant first.
  const [col] = await get<{ tenant_id: string }>(`collections?select=tenant_id&id=eq.${colId}`);
  if (col?.tenant_id !== NEW) throw new Error("SAFETY: collection is not in the new tenant");
  await write("POST", "/rest/v1/rpc/set_collection_products", { p_collection: colId, p_product_ids: pids }, owner.token, true);
}

// ------------------------------------------------------------------ media

const srcMedia = await get<Record<string, unknown> & { product_id: string; variant_id: string | null; storage_path: string }>(`product_media?select=*&${S}&order=position`);
const withMedia = new Set((await get<{ product_id: string }>(`product_media?select=product_id&${N}`)).map((m) => m.product_id));
const mediaRows = srcMedia
  .filter((m) => ids.has(m.product_id) && !withMedia.has(ids.get(m.product_id)!))
  .map((m) => ({
    tenant_id: NEW,
    product_id: ids.get(m.product_id),
    variant_id: m.variant_id ? (ids.get(m.variant_id) ?? null) : null,
    ...(rewrite(pick(m, ["storage_path", "alt_text", "media_type", "width", "height", "position"]), ids) as object),
  }));
srcMedia.forEach((m) => rewrite(m.storage_path, ids)); // record every product file for copying
if (mediaRows.length) await insert("product_media", mediaRows);

const srcAssets = await get<Record<string, unknown> & { storage_path: string }>(`media_assets?select=*&${S}&order=created_at`);
const haveAssets = new Set((await get<{ storage_path: string }>(`media_assets?select=storage_path&${N}`)).map((a) => a.storage_path));
const assetRows = srcAssets
  .map((a) => ({ tenant_id: NEW, ...(rewrite(pick(a, ["storage_path", "mime_type", "bytes", "width", "height", "alt_text", "filename", "folder"]), ids) as { storage_path: string }) }))
  .filter((a) => !haveAssets.has(a.storage_path));
if (assetRows.length) await insert("media_assets", assetRows);

// ------------------------------------------------------------------ content

const srcPages = await get<Record<string, unknown> & { id: string; slug: string }>(`pages?select=*&${S}`);
const havePages = await get<{ id: string; slug: string }>(`pages?select=id,slug&${N}`);
for (const p of srcPages) {
  const have = havePages.find((x) => x.slug === p.slug);
  const id = have?.id ?? (await insert<{ id: string }>("pages", { tenant_id: NEW, ...(rewrite(pick(p, ["title", "slug", "kind", "body", "seo", "status", "published_at"]), ids) as object) }))[0]!.id;
  ids.set(p.id, id);
}
const srcFaqs = await get<Record<string, unknown>>(`faqs?select=*&${S}&order=position`);
if (!(await get(`faqs?select=id&${N}&limit=1`)).length && srcFaqs.length) await insert("faqs", srcFaqs.map((f) => ({ tenant_id: NEW, ...pick(f, ["question", "answer", "group_name", "position", "status"]) })));

const srcMenus = await get<{ id: string; handle: string; title: string }>(`menus?select=id,handle,title&${S}`);
const srcItems = await get<Record<string, unknown> & { id: string; menu_id: string; parent_id: string | null }>(`menu_items?select=*&${S}&order=position`);
const haveMenus = await get<{ id: string; handle: string }>(`menus?select=id,handle&${N}`);
for (const m of srcMenus) {
  if (haveMenus.some((x) => x.handle === m.handle)) continue; // keep an existing menu (and its items) as is
  const [menu] = await insert<{ id: string }>("menus", { tenant_id: NEW, handle: m.handle, title: m.title });
  ids.set(m.id, menu!.id);
  for (let pending = srcItems.filter((i) => i.menu_id === m.id); pending.length; ) {
    const ready = pending.filter((i) => !i.parent_id || ids.has(i.parent_id));
    if (!ready.length) throw new Error(`menu ${m.handle}: orphan items`);
    for (const it of ready) {
      const [row] = await insert<{ id: string }>("menu_items", {
        tenant_id: NEW,
        menu_id: menu!.id,
        parent_id: it.parent_id ? ids.get(it.parent_id) : null,
        ...(rewrite(pick(it, ["title", "link_type", "url", "highlight", "image_path", "position"]), ids) as object),
        link_ref: it.link_ref ? (ids.get(it.link_ref as string) ?? null) : null,
      });
      ids.set(it.id, row!.id);
    }
    pending = pending.filter((i) => !ids.has(i.id));
  }
}

// ------------------------------------------------------------------ storage files

const tally = { copied: 0, exists: 0, missing: 0 };
for (const src of paths) {
  const r = await copyObject(src, `tenant/${NEW}/${src.slice(SRC_PREFIX.length)}`);
  tally[r]++;
  if (r === "missing") console.log("   missing at source:", src);
}
console.log(`  storage: ${tally.copied} copied, ${tally.exists} already there, ${tally.missing} missing at source`);

// ------------------------------------------------------------------ report

const TABLES = ["categories", "collections", "collection_products", "size_charts", "products", "product_options", "product_option_values", "product_variants", "inventory_levels", "product_media", "media_assets", "pages", "faqs", "menus", "menu_items", "reviews", "orders", "customers", "discounts", "theme_versions"];
const count = async (t: string, f: string) => {
  const res = await fetch(`${URL_}/rest/v1/${t}?select=tenant_id&${f}`, { method: "HEAD", headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, Prefer: "count=exact" } });
  return res.headers.get("content-range")?.split("/")[1] ?? "?";
};
console.log(`\n${"table".padEnd(24)}${"source".padStart(8)}${"new".padStart(8)}`);
for (const t of TABLES) console.log(`${t.padEnd(24)}${(await count(t, S)).padStart(8)}${(await count(t, N)).padStart(8)}`);
console.log(`\n✓ tenant ${NEW}\n  http://${SLUG}.${ROOT}${ROOT === "localhost" ? ":3000" : ""}`);
