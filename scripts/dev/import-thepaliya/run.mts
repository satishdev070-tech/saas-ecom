/**
 * Imports the old thepaliya.com store (snapshot in ./data, media in MEDIA_DIR) into the
 * "the-paliya" tenant: store identity, categories, products (exact titles, copy, prices,
 * per-size stock, original images), size chart, pages, FAQs, menus and the home page theme.
 *
 *   MEDIA_DIR=/path/to/media pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/import-thepaliya/run.mts
 *
 * Idempotent: rows are matched by slug / storage path, so re-running updates instead of
 * duplicating. Products go through the real save_product RPC as the store owner (same validation
 * as the dashboard). Uses the Supabase secret key: run only by an operator, never in the app.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { productInputSchema, toSaveProductPayload } from "../../../src/features/catalog/schemas";
import { resolveThemeConfig, parseThemeConfigStrict } from "../../../src/features/theme/schema/config";
import { defaultSettings } from "../../../src/features/theme/sections/definitions";
import type { SectionType } from "../../../src/features/theme/sections/types";

const HERE = dirname(fileURLToPath(import.meta.url));
function env(name: string): string {
  const v = process.env[name] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUBLISHABLE = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const MEDIA = env("MEDIA_DIR");
const SLUG = "the-paliya";
if (!URL_ || !SECRET || !PUBLISHABLE) throw new Error("Supabase env vars are required");
if (!MEDIA || !existsSync(MEDIA)) throw new Error("Set MEDIA_DIR to the downloaded media folder");

type Variant = { value: string; price: number; original_price: number; quantity: number; is_available: number; stock_management: number };
type OldProduct = {
  old_id: string; slug: string; title: string; price: string; original_price: string; crumbs: [string, string][];
  description: string; additional: string; description_html: string; size_chart_text: string; image_files: string[]; video_file: string | null; option: string; variants: Variant[];
};
const products = JSON.parse(readFileSync(join(HERE, "data/products.json"), "utf8")) as OldProduct[];
const site = JSON.parse(readFileSync(join(HERE, "data/site.json"), "utf8"));

// ------------------------------------------------------------------ HTTP

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: opts.token ? PUBLISHABLE : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: opts.prefer ?? "return=representation" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const rest = <T = unknown,>(method: string, path: string, body?: unknown, prefer?: string) => http<T>(method, `/rest/v1/${path}`, { body, prefer });

async function upload(path: string, bytes: Buffer, type: string) {
  const res = await fetch(`${URL_}/storage/v1/object/store-assets/${path}`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": type, "x-upsert": "true", "cache-control": "31536000" },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`upload ${path} → ${res.status} ${await res.text()}`);
}

async function ownerToken(tenantId: string): Promise<string> {
  const [m] = await rest<{ user_id: string }[]>("GET", `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&role=eq.owner&limit=1`);
  if (!m) throw new Error("store has no owner");
  const user = await http<{ email: string }>("GET", `/auth/v1/admin/users/${m.user_id}`);
  // Magic-link token exchange: signs in as the owner without knowing or changing their password.
  const link = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email: user.email } });
  const hashed = link.properties?.hashed_token ?? link.hashed_token;
  const res = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: hashed }) });
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error(`could not open an owner session (${res.status})`);
  return j.access_token;
}

// ------------------------------------------------------------------ media

const assetRows = new Map<string, Record<string, unknown>>();
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Uploads an original file unchanged (exact media) and records it for the media library. */
async function putFile(tenantId: string, file: string, area: string, folder: string, alt: string): Promise<{ path: string; width: number | null; height: number | null }> {
  const ext = file.split(".").pop()!.toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`unsupported media type ${file}`);
  const bytes = readFileSync(join(MEDIA, file));
  const meta = await sharp(bytes).metadata();
  const name = file.replace(/^[a-z_]+__/, "").replace(/\.[a-z]+$/, "");
  const path = `tenant/${tenantId}/${area}/thepaliya-${name}.${ext === "jpeg" ? "jpg" : ext}`;
  await upload(path, bytes, mime);
  assetRows.set(path, { tenant_id: tenantId, storage_path: path, mime_type: mime, bytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, alt_text: alt.slice(0, 300), filename: file.replace(/^[a-z_]+__/, ""), folder });
  return { path, width: meta.width ?? null, height: meta.height ?? null };
}

// ------------------------------------------------------------------ mapping helpers

const TYPE: Record<string, string> = {
  "blue-green-bow-dress": "dress", "blue-lehariya-dress": "dress", "blue-printed-pocket-dress": "dress", "oblong-neckline-block-print-dress-blue-green": "dress",
  "straight-cut-v-neck-kaftan-dress": "dress", "floral-print-cotton-co-ord-set-waistcoat-pants": "co_ord_set", "floral-print-crop-top-maxi-skirt-set": "co_ord_set",
  "floral-print-cotton-kurti-bell-sleeves": "kurta", "floral-print-sleeveless-cotton-top": "top", "floral-print-cotton-tunic-top": "top",
};
const rupees = (n: number) => n.toFixed(2);
const catSlugOf = (p: OldProduct) => {
  const last = p.crumbs[p.crumbs.length - 1]?.[1] ?? "";
  return new URL(last.replace(/&amp;/g, "&")).searchParams.get("subcategory") ?? new URL(last).searchParams.get("category") ?? "collections";
};
/** Old copy verbatim: description, then the "Additional Information" tab under its own heading. */
const fullDescription = (p: OldProduct) => [p.description.replace(/\n{3,}/g, "\n\n"), p.additional ? `Additional Information\n\n${p.additional.replace(/\n{3,}/g, "\n\n")}` : ""].filter(Boolean).join("\n\n");
function fabricOf(p: OldProduct): string | undefined {
  const m = `${p.description}\n${p.additional}`.match(/Fabric\s*[:=–-]\s*([^\n]+)/i);
  return m ? m[1]!.replace(/\*+/g, "").trim().slice(0, 80) : undefined;
}
/** "Body Measurements" table from the old size-chart tab → {columns, rows}. */
function parseSizeChart(text: string): { columns: string[]; rows: string[][]; note?: string } | null {
  if (!text || /Currently Unavailable/i.test(text)) return null;
  const cells = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const start = cells.indexOf("Size");
  if (start < 0) return null;
  const columns = [cells[start]!, cells[start + 1]!, cells[start + 2]!];
  const rows: string[][] = [];
  let i = start + 3;
  for (; i + 2 < cells.length && !/measurements are/i.test(cells[i]!); i += 3) rows.push([cells[i]!, cells[i + 1]!, cells[i + 2]!]);
  const note = cells.find((c) => /measurements are/i.test(c));
  return { columns, rows, ...(note ? { note } : {}) };
}

let seq = 0;
const section = (type: string, settings: Record<string, unknown>, visibility = { desktop: true, mobile: true }) => ({ id: `${type.toLowerCase()}-rg${++seq}`, type, settings: { ...defaultSettings(type as SectionType), ...settings }, visibility });

// ------------------------------------------------------------------ run

const [tenant] = await rest<{ id: string }[]>("GET", `tenants?select=id&slug=eq.${SLUG}`);
if (!tenant) throw new Error(`tenant ${SLUG} not found`);
const T = tenant.id;
const token = await ownerToken(T);
console.log(`Importing thepaliya.com into ${SLUG} (${T})`);

// 1. Store identity
const logo = await putFile(T, site.store.logo, "brand", "brand", `${site.store.name} logo`);
const favicon = await putFile(T, site.store.favicon, "brand", "brand", `${site.store.name} icon`);
const og = await putFile(T, site.store.og_image, "brand", "brand", site.store.name);
const [store] = await rest<{ address: Record<string, unknown>; seo: Record<string, unknown> }[]>("GET", `stores?select=address,seo&tenant_id=eq.${T}`);
await rest("PATCH", `stores?tenant_id=eq.${T}`, {
  name: site.store.name,
  description: site.about,
  email: site.store.email,
  phone: site.store.phone,
  whatsapp: site.store.whatsapp,
  address: { ...(store?.address ?? {}), line1: site.store.address.line1, city: site.store.address.city, state: site.store.address.state, country: "IN" },
  social: site.store.social,
  logo_path: logo.path,
  favicon_path: favicon.path,
  seo: { ...(store?.seo ?? {}), title: site.store.seo.title, description: site.store.seo.description, og_image_path: og.path },
});
await rest("PATCH", `tenants?id=eq.${T}`, { name: site.store.name });
console.log("  ✓ store identity");

// 2. Categories (tree, old order, old images)
const existingCats = await rest<{ id: string; slug: string }[]>("GET", `categories?select=id,slug&tenant_id=eq.${T}`);
const catId: Record<string, string> = Object.fromEntries(existingCats.map((c) => [c.slug, c.id]));
async function upsertCategory(c: { slug: string; name: string }, position: number, parentId: string | null, image: string | null) {
  const row = { tenant_id: T, name: c.name, slug: c.slug, position, parent_id: parentId, status: "active", ...(image ? { image_path: image } : {}) };
  if (catId[c.slug]) await rest("PATCH", `categories?id=eq.${catId[c.slug]}`, row);
  else catId[c.slug] = (await rest<{ id: string }[]>("POST", "categories", row))[0]!.id;
}
for (const [i, c] of site.categories.entries()) {
  const img = await putFile(T, c.image, "categories", "categories", c.name);
  await upsertCategory(c, i + 1, null, img.path);
  for (const [j, ch] of c.children.entries()) await upsertCategory(ch, j + 1, catId[c.slug]!, null);
}
console.log(`  ✓ ${Object.keys(catId).length} categories`);

// 3. Size chart (only one product had a real chart on the old site)
let chartId: string | null = null;
const chartSource = products.find((p) => parseSizeChart(p.size_chart_text));
if (chartSource) {
  const chart = parseSizeChart(chartSource.size_chart_text)!;
  const found = await rest<{ id: string }[]>("GET", `size_charts?select=id&tenant_id=eq.${T}&name=eq.Body%20Measurements`);
  chartId = found[0]?.id ?? (await rest<{ id: string }[]>("POST", "size_charts", { tenant_id: T, name: "Body Measurements", unit: "in", chart }))[0]!.id;
  if (found[0]) await rest("PATCH", `size_charts?id=eq.${chartId}`, { chart });
}

// 4. Products
const existing = await rest<{ id: string; slug: string; updated_at: string }[]>("GET", `products?select=id,slug,updated_at&tenant_id=eq.${T}`);
const productId: Record<string, string> = {};
const skuMap: { old_id: string; slug: string; old_sku?: string; variant: string; sku: string }[] = [];
for (const p of products) {
  const real = p.variants.filter((v) => v.stock_management === 1 && v.price > 0); // drops the old placeholder "Color" row (₹0, qty 0)
  const hasSizes = real.length > 0;
  const variants = hasSizes
    ? real.map((v) => ({
        option1: v.value,
        sku: `RG-${p.old_id}-${v.value}`,
        price: rupees(v.price),
        compareAtPrice: v.original_price > v.price ? rupees(v.original_price) : null,
        trackInventory: true,
        lowStockThreshold: 1,
        initialStock: Math.max(0, v.quantity),
        weightGrams: 400,
      }))
    : [{ sku: `RG-${p.old_id}`, price: rupees(Number(p.price)), compareAtPrice: Number(p.original_price) > Number(p.price) ? rupees(Number(p.original_price)) : null, trackInventory: false, weightGrams: 400 }];
  for (const v of variants) skuMap.push({ old_id: p.old_id, slug: p.slug, variant: (v as { option1?: string }).option1 ?? "default", sku: v.sku });
  const existingRow = existing.find((e) => e.slug === p.slug);
  const input = productInputSchema.parse({
    title: p.title,
    slug: p.slug,
    description: fullDescription(p),
    productType: TYPE[p.slug] ?? "other",
    brand: site.store.name,
    categoryId: catId[catSlugOf(p)],
    sizeChartId: chartSource && p.slug === chartSource.slug ? chartId : undefined,
    status: "active",
    tags: [catSlugOf(p)],
    attributes: { fabric: fabricOf(p), occasion: [] },
    options: hasSizes ? [{ name: p.option || "Size", values: real.map((v) => ({ value: v.value })) }] : [],
    variants,
  });
  // Re-runs keep existing products (and their live stock); only media is refreshed.
  const id = existingRow ? existingRow.id : await http<string>("POST", "/rest/v1/rpc/save_product", { token, body: { p_tenant: T, p_payload: toSaveProductPayload(input, { allowInitialStock: true }) } });
  productId[p.slug] = id;

  // Images: original files, old gallery order, deduplicated by content.
  const seen = new Set<string>();
  const media: Record<string, unknown>[] = [];
  for (const f of p.image_files) {
    const sig = createHash("sha1").update(readFileSync(join(MEDIA, f))).digest("hex");
    if (seen.has(sig)) continue;
    seen.add(sig);
    const alt = media.length === 0 ? p.title : `${p.title} — view ${media.length + 1}`;
    const up = await putFile(T, f, "products", "products", alt);
    media.push({ tenant_id: T, product_id: id, storage_path: up.path, alt_text: alt, width: up.width, height: up.height, position: media.length, media_type: "image" });
  }
  await rest("DELETE", `product_media?tenant_id=eq.${T}&product_id=eq.${id}`, undefined, "return=minimal");
  await rest("POST", "product_media", media, "return=minimal");
  console.log(`  ✓ ${p.title} · ${variants.length} variant(s) · ${media.length} image(s)`);
}

// 5. Home page rails as manual collections (exact old order)
async function manualCollection(slug: string, title: string, order: string[], position: number) {
  const found = await rest<{ id: string }[]>("GET", `collections?select=id&tenant_id=eq.${T}&slug=eq.${slug}`);
  const id = found[0]?.id ?? (await rest<{ id: string }[]>("POST", "collections", { tenant_id: T, title, slug, type: "manual", sort_order: "manual", position, status: "active", rules: { match: "all", conditions: [] } }))[0]!.id;
  await http("POST", "/rest/v1/rpc/set_collection_products", { token, body: { p_collection: id, p_product_ids: order.map((s) => productId[s]).filter(Boolean) } });
  return id;
}
const bestId = await manualCollection("best-selling-products", site.home.best_selling.heading, site.home.best_selling.order, 1);
const newId = await manualCollection("new-arrival-products", site.home.new_arrivals.heading, site.home.new_arrivals.order, 2);
console.log("  ✓ collections: Best Selling Products, New Arrival Products");

// 6. Pages and FAQs (verbatim)
const now = new Date().toISOString();
async function upsertPage(slug: string, title: string, kind: string, body: unknown[]) {
  const found = await rest<{ id: string }[]>("GET", `pages?select=id&tenant_id=eq.${T}&slug=eq.${slug}`);
  const row = { tenant_id: T, title, slug, kind, status: "published", published_at: now, body };
  if (found[0]) await rest("PATCH", `pages?id=eq.${found[0].id}`, row);
  else await rest("POST", "pages", row);
}
await upsertPage("about", "About Us", "about", [{ type: "paragraph", text: site.about }]);
await upsertPage("contact", "Contact Us", "contact", [
  { type: "heading", level: 2, text: "Let's Get In Touch" },
  { type: "paragraph", text: `Email : ${site.contact.email}` },
  { type: "paragraph", text: `Mobile : ${site.contact.mobile}` },
  { type: "paragraph", text: site.contact.address },
]);
await rest("DELETE", `faqs?tenant_id=eq.${T}`, undefined, "return=minimal");
await rest("POST", "faqs", site.faqs.map((f: { question: string; answer: string }, i: number) => ({ tenant_id: T, question: f.question, answer: f.answer, position: i + 1, status: "published" })), "return=minimal");
console.log(`  ✓ pages: About Us, Contact Us · ${site.faqs.length} FAQs`);

// 7. Menus (mirrors the old header + footer)
async function menu(handle: string, title: string) {
  const found = await rest<{ id: string }[]>("GET", `menus?select=id&tenant_id=eq.${T}&handle=eq.${handle}`);
  const id = found[0]?.id ?? (await rest<{ id: string }[]>("POST", "menus", { tenant_id: T, handle, title }))[0]!.id;
  await rest("DELETE", `menu_items?tenant_id=eq.${T}&menu_id=eq.${id}`, undefined, "return=minimal");
  return id;
}
const mainId = await menu("main", "Main menu");
const item = async (menuId: string, title: string, url: string, position: number, parent: string | null = null) =>
  (await rest<{ id: string }[]>("POST", "menu_items", { tenant_id: T, menu_id: menuId, parent_id: parent, title, link_type: "url", url, position, highlight: false }))[0]!.id;
await item(mainId, "Home", "/", 1);
await item(mainId, "Our Story", "/pages/about", 2);
for (const [i, c] of site.categories.entries()) {
  const parent = await item(mainId, c.name, `/categories/${c.slug}`, i + 3);
  for (const [j, ch] of c.children.entries()) await item(mainId, ch.name, `/categories/${ch.slug}`, j + 1, parent);
}
const shopId = await menu("shop", "Information");
await item(shopId, "Shop All", "/search", 1);
for (const [i, c] of site.categories.entries()) await item(shopId, c.name, `/categories/${c.slug}`, i + 2);
const helpId = await menu("footer", "Get Help");
for (const [i, [t, u]] of ([["About Us", "/pages/about"], ["FAQs", "/faq"], ["Contact Us", "/pages/contact"]] as const).entries()) await item(helpId, t, u, i + 1);
console.log("  ✓ menus: main, Information, Get Help");

// 8. Home page theme (old layout, old banners) → draft, then publish
const hero = await Promise.all(site.home.hero.map((f: string, i: number) => putFile(T, f, "theme", "banners", `${site.store.name} banner ${i + 1}`)));
const offers = await Promise.all(site.home.offers.map((f: string, i: number) => putFile(T, f, "theme", "banners", `${site.store.name} offer ${i + 1}`)));
const insta = await putFile(T, site.home.instagram_banner.image, "theme", "banners", `${site.store.name} on Instagram`);
const [draft] = await rest<{ id: string; config: unknown }[]>("GET", `theme_versions?select=id,config&tenant_id=eq.${T}&status=eq.draft`);
const [published] = await rest<{ config: unknown }[]>("GET", `theme_versions?select=config&tenant_id=eq.${T}&status=eq.published`);
const base = resolveThemeConfig(draft?.config ?? published?.config ?? {}).config;
const topCats = site.categories.map((c: { slug: string }) => ({ id: catId[c.slug], imagePath: "", label: "" }));
const raw = {
  ...base,
  header: { ...base.header, menuHandle: "main", showStoreName: false },
  layout: {
    header: [section("Header", { layout: "logo-left", showInlineMenu: false }), section("MegaMenu", { menuHandle: "main", uppercase: false, showImages: false }, { desktop: true, mobile: false })],
    footer: [section("Footer", { menuHandles: ["shop", "footer"], about: site.store.footer_about, tone: "dark", showContact: true, showSocial: true, showPaymentNote: true })],
  },
  templates: {
    ...base.templates,
    home: [
      section("Hero", { height: "banner", overlay: 0, slides: hero.map((h, i) => ({ imagePath: h.path, mobileImagePath: "", alt: `${site.store.name} banner ${i + 1}`, eyebrow: "", heading: "", subheading: "", ctaLabel: "", ctaHref: "", align: "left", textTone: "light" })) }),
      section("CategoryGrid", { eyebrow: "", heading: "Shop by category", subheading: "", mode: "manual", items: topCats, limit: 4, shape: "circle" }),
      section("PromoBanner", { aspect: "banner", tiles: offers.map((o, i) => ({ imagePath: o.path, alt: `${site.store.name} offer ${i + 1}`, heading: "", text: "", ctaLabel: "", ctaHref: "" })) }),
      section("ProductGrid", { eyebrow: site.home.best_selling.eyebrow, heading: site.home.best_selling.heading, source: "collection", collectionId: bestId, limit: 10, columns: 4, viewAllHref: "/collections/best-selling-products" }),
      section("PromoBanner", { aspect: "banner", tiles: [{ imagePath: insta.path, alt: `${site.store.name} on Instagram`, heading: "", text: "", ctaLabel: "", ctaHref: site.home.instagram_banner.href }] }),
      section("ProductGrid", { eyebrow: site.home.new_arrivals.eyebrow, heading: site.home.new_arrivals.heading, source: "collection", collectionId: newId, limit: 10, columns: 4, viewAllHref: "/collections/new-arrival-products" }),
    ],
    // The old site made no shipping/returns promises: drop the default theme's trust badges.
    product: base.templates.product.filter((x) => x.type !== "TrustBadges"),
  },
};
const strict = parseThemeConfigStrict(raw);
if (!strict.ok) throw new Error(`theme config invalid: ${JSON.stringify(strict.issues.slice(0, 5))}`);
if (draft) await rest("PATCH", `theme_versions?id=eq.${draft.id}`, { config: strict.config, label: "thepaliya.com import" });
else {
  const [latest] = await rest<{ version: number }[]>("GET", `theme_versions?select=version&tenant_id=eq.${T}&order=version.desc&limit=1`);
  await rest("POST", "theme_versions", { tenant_id: T, theme_key: "aangan", version: (latest?.version ?? 0) + 1, status: "draft", label: "thepaliya.com import", config: strict.config });
}
await http("POST", "/rest/v1/rpc/publish_theme", { token, body: { p_tenant: T, p_label: "thepaliya.com import" } });
console.log("  ✓ home page theme published");

// 9. Media library rows
const paths = [...assetRows.keys()];
const have = new Set((await rest<{ storage_path: string }[]>("GET", `media_assets?select=storage_path&tenant_id=eq.${T}&storage_path=like.*thepaliya-*`)).map((r) => r.storage_path));
const fresh = paths.filter((p) => !have.has(p)).map((p) => assetRows.get(p)!);
if (fresh.length) await rest("POST", "media_assets", fresh, "return=minimal");
console.log(`  ✓ media library: ${paths.length} files (${fresh.length} new)`);

console.log("\nSKU mapping (old id → new SKU):");
for (const s of skuMap) console.log(`  #${s.old_id} ${s.slug} ${s.variant} → ${s.sku}`);
console.log("done");
