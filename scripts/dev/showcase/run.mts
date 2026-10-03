/**
 * DEV / DEMO ONLY — builds the showcase demo stores used by the theme marketplace's Live Preview:
 * one store per industry with real open-licence photography, ~20 products each, category
 * specifications, content pages and a theme "content pool" (named slots) that every theme of the
 * industry can draw from.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/showcase/run.mts <slug …> [--retheme]
 *
 * SAFETY
 *  - Only slugs in SHOWCASE_STORES (src/features/theme/marketplace/showcase.ts) are accepted.
 *  - An existing tenant with that slug is only touched if its owner is owner@<slug>.test and its
 *    id is not in PROTECTED_TENANT_IDS; otherwise the run stops. Real stores are never read or written.
 *  - Every write is scoped to that one tenant id. Nothing is truncated or bulk-deleted; existing
 *    products, pages, menus and media are kept (the run is idempotent and resumable).
 *  - --retheme replaces ONLY this demo tenant's theme versions (to pick up new slots/themes).
 *  - --refresh-images re-uploads ONLY this demo tenant's product/banner photos (after changing picks).
 *  - Owner accounts get a random password that is never printed or stored; sessions come from a
 *    one-time magic link. Reviews are not seeded (no fake social proof).
 */
import { randomBytes } from "node:crypto";
import { resolveThemeConfig } from "../../../src/features/theme/schema/config";
import { defaultSettings } from "../../../src/features/theme/sections/definitions";
import type { SectionType } from "../../../src/features/theme/sections/types";
import { productInputSchema, toSaveProductPayload } from "../../../src/features/catalog/schemas";
import { findMarketplaceTheme, MARKETPLACE_THEMES } from "../../../src/features/theme/marketplace/catalog";
import { applyThemePreset } from "../../../src/features/theme/marketplace/apply";
import { PROTECTED_TENANT_IDS, SHOWCASE_STORES, isShowcaseSlug } from "../../../src/features/theme/marketplace/showcase";
import { download, loadSpec, picked, sharp, type Hit } from "./images.mjs";
import type { ShowcaseSpec, ShowProduct, Slot } from "./types";

function env(name: string): string {
  const v = process.env[name] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUBLISHABLE = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const ROOT = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? "localhost";
if (!URL_ || !SECRET || !PUBLISHABLE) throw new Error("Supabase env vars are required");

// ------------------------------------------------------------------ HTTP

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: opts.token ? PUBLISHABLE : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: opts.prefer ?? "return=representation" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const rest = <T = unknown,>(method: string, path: string, body?: unknown, token?: string) => http<T>(method, `/rest/v1/${path}`, { body, token });

async function upload(path: string, bytes: Buffer, type: string) {
  const res = await fetch(`${URL_}/storage/v1/object/store-assets/${path}`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": type, "x-upsert": "true", "cache-control": "31536000" },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`upload ${path} → ${res.status} ${await res.text()}`);
}

/** Creates (or finds) owner@<slug>.test with a random, unrecorded password; returns a session via magic link. */
async function ownerSession(slug: string, name: string): Promise<{ token: string; userId: string; email: string }> {
  const email = `owner@${slug}.test`;
  try {
    await http("POST", "/auth/v1/admin/users", { body: { email, password: randomBytes(24).toString("base64url"), email_confirm: true, user_metadata: { display_name: name } } });
  } catch (e) {
    if (!/422|already/.test(String(e))) throw e;
  }
  const link = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email } });
  const res = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.properties?.hashed_token ?? link.hashed_token }) });
  const j = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!j.access_token || !j.user) throw new Error(`session failed for ${email}`);
  return { token: j.access_token, userId: j.user.id, email };
}

// ------------------------------------------------------------------ helpers

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}
const stockFor = (key: string, i: number) => (i % 7 === 5 ? 0 : i % 5 === 3 ? 2 : 6 + (hash(key) % 40));

async function toWebp(raw: Buffer, width: number) {
  const out = await sharp(raw).resize(width).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  return { bytes: out.data, width: out.info.width, height: out.info.height };
}

function resolve(value: unknown, refs: Record<string, string>): unknown {
  if (typeof value === "string" && value.startsWith("$")) return refs[value] ?? "";
  if (Array.isArray(value)) return value.map((v) => resolve(v, refs));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, refs)]));
  return value;
}

const section = (id: string, type: string, settings: Record<string, unknown>, visibility = { desktop: true, mobile: true }) => ({ id, type, settings: { ...defaultSettings(type as SectionType), ...settings }, visibility });

type Credit = { what: string; hit: Hit };

// ------------------------------------------------------------------ guard

async function guard(s: ShowcaseSpec): Promise<string | null> {
  if (!isShowcaseSlug(s.slug) || SHOWCASE_STORES[s.slug]!.industry !== s.industry) throw new Error(`${s.slug} is not a registered showcase store`);
  const rows = await rest<{ id: string }[]>("GET", `tenants?select=id&slug=eq.${encodeURIComponent(s.slug)}`);
  if (!rows.length) return null;
  const id = rows[0]!.id;
  if (PROTECTED_TENANT_IDS.has(id.toLowerCase())) throw new Error(`refusing: ${s.slug} resolves to a protected tenant`);
  const owners = await rest<{ user_id: string }[]>("GET", `tenant_memberships?select=user_id&tenant_id=eq.${id}&role=eq.owner`);
  const users = await Promise.all(owners.map((o) => http<{ email?: string }>("GET", `/auth/v1/admin/users/${o.user_id}`).catch(() => ({ email: "" }))));
  if (!users.some((u) => u.email === `owner@${s.slug}.test`)) throw new Error(`refusing: tenant "${s.slug}" exists but isn't owned by owner@${s.slug}.test — it may be a real store`);
  return id;
}

// ------------------------------------------------------------------ one store

async function build(s: ShowcaseSpec, opts: { retheme: boolean; refreshImages: boolean }) {
  const theme = findMarketplaceTheme(s.theme);
  if (!theme || theme.industry !== s.industry) throw new Error(`theme ${s.theme} is not a ${s.industry} theme`);
  const missing = [...new Set(MARKETPLACE_THEMES.filter((t) => t.industry === s.industry).flatMap((t) => [...t.preset.home, ...(t.preset.collection ?? []), ...(t.preset.product ?? [])].map((x) => x[2]).filter((x): x is string => !!x && !s.slots[x])))];
  if (missing.length) throw new Error(`${s.slug}: content pool is missing slots used by ${s.industry} themes: ${missing.join(", ")}`);
  const existing = await guard(s);
  console.log(`${existing ? "↻" : "▶"} ${s.name} (${s.industry})`);
  const owner = await ownerSession(s.slug, s.owner);
  const tenantId = existing ?? (await http<string>("POST", "/rest/v1/rpc/create_tenant", { token: owner.token, body: { p_name: s.name, p_slug: s.slug, p_root_domain: ROOT } }));
  const T = `tenant_id=eq.${tenantId}`;
  const plan = await rest<{ id: string }[]>("GET", "plans?select=id&code=eq.growth");
  await rest("PATCH", `tenants?id=eq.${tenantId}`, { status: "active", trial_ends_at: null, plan_id: plan[0]?.id ?? null });
  // Migration 1800 columns: mark as a demo store in its industry (skipped if not migrated yet).
  try {
    await rest("PATCH", `tenants?id=eq.${tenantId}`, { store_type: "demo" });
    const cat = await rest<{ id: string }[]>("GET", `store_categories?select=id&slug=eq.${s.industry}`);
    if (cat[0]) await rest("PATCH", `stores?${T}`, { category_id: cat[0].id });
  } catch {
    console.log("  (store_type/category not set: migration 1800 not applied yet)");
  }
  await rest("PATCH", `stores?${T}`, {
    tagline: s.tagline,
    description: s.story[0],
    email: s.email,
    phone: s.phone,
    address: { ...s.address, country: "IN" },
    legal_name: s.legalName,
    seo: s.seo,
  });

  // Categories & collections (by slug; existing rows kept)
  const oldCats = await rest<{ id: string; slug: string }[]>("GET", `categories?select=id,slug&${T}`);
  const addCats = s.categories.filter((c) => !oldCats.some((o) => o.slug === c.slug));
  const cats = [...oldCats, ...(addCats.length ? await rest<{ id: string; slug: string }[]>("POST", "categories", addCats.map((c) => ({ tenant_id: tenantId, name: c.name, slug: c.slug, description: c.description, position: s.categories.indexOf(c) + 1 }))) : [])];
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  const oldCols = await rest<{ id: string; slug: string }[]>("GET", `collections?select=id,slug&${T}`);
  const addCols = s.collections.filter((c) => !oldCols.some((o) => o.slug === c.slug));
  const cols = [
    ...oldCols,
    ...(addCols.length
      ? await rest<{ id: string; slug: string }[]>(
          "POST",
          "collections",
          addCols.map((c) => ({
            tenant_id: tenantId,
            title: c.title,
            slug: c.slug,
            description: c.description,
            type: c.tag ? "automated" : "manual",
            rules: { match: "all", conditions: c.tag ? [{ field: "tag", op: "eq", value: c.tag }] : [] },
            sort_order: c.tag ? "newest" : "manual",
            position: s.collections.indexOf(c) + 1,
          })),
        )
      : []),
  ];
  const colId = Object.fromEntries(cols.map((c) => [c.slug, c.id]));

  // Products (real save_product RPC, as the owner)
  const credits: Credit[] = [];
  const productIds: string[] = [];
  const oldProducts = await rest<{ id: string; slug: string }[]>("GET", `products?select=id,slug&${T}`);
  const prefix = s.slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
  for (const [i, p] of s.products.entries()) {
    const done = oldProducts.find((o) => o.slug === slugify(p.title));
    if (done) {
      productIds.push(done.id);
      continue;
    }
    productIds.push(await saveProduct(s, p, i, prefix, tenantId, owner.token, catId));
  }
  for (const c of s.collections.filter((x) => !x.tag)) {
    const ids = s.products.map((p, i) => (p.collections?.includes(c.slug) ? productIds[i] : null)).filter((x): x is string => !!x);
    if (ids.length) await http("POST", "/rest/v1/rpc/set_collection_products", { token: owner.token, body: { p_collection: colId[c.slug], p_product_ids: ids } });
  }

  // --refresh-images: drop THIS demo tenant's product media rows and banner files so new picks apply.
  if (opts.refreshImages) {
    await rest("DELETE", `product_media?${T}`);
    await rest("DELETE", `media_assets?${T}&folder=in.(products,banners)`);
  }
  // Product photography (only for products without media)
  const withMedia = new Set((await rest<{ product_id: string }[]>("GET", `product_media?select=product_id&${T}`)).map((m) => m.product_id));
  const front: string[] = [];
  const assetRows: Record<string, unknown>[] = [];
  for (const [i, p] of s.products.entries()) {
    const hits = await picked(p.img);
    hits.forEach((h) => credits.push({ what: p.title, hit: h }));
    // Photo id in the path: a new pick gets a new URL (no stale CDN / image-optimizer cache).
    const paths = hits.map((h, k) => `tenant/${tenantId}/products/${slugify(p.title)}-${k + 1}-${h.id.slice(0, 8)}.webp`);
    front.push(paths[0]!);
    if (withMedia.has(productIds[i]!)) continue;
    const media: Record<string, unknown>[] = [];
    for (const [k, h] of hits.entries()) {
      const img = await toWebp(await download(h.url), 1400);
      await upload(paths[k]!, img.bytes, "image/webp");
      const alt = k === 0 ? `${p.title}` : `${p.title}, another view`;
      media.push({ tenant_id: tenantId, product_id: productIds[i], storage_path: paths[k], alt_text: alt, width: img.width, height: img.height, position: k, media_type: "image" });
      assetRows.push({ tenant_id: tenantId, storage_path: paths[k], mime_type: "image/webp", bytes: img.bytes.length, width: img.width, height: img.height, alt_text: alt, filename: `${slugify(p.title)}-${k + 1}.webp`, folder: "products" });
    }
    await rest("POST", "product_media", media);
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // Content imagery (hero, features, promos…)
  const imgRef: Record<string, string> = {};
  for (const [key, spec] of Object.entries(s.images)) {
    const [h] = await picked(spec);
    credits.push({ what: `Banner: ${key}`, hit: h! });
    const path = `tenant/${tenantId}/theme/${key}-${h!.id.slice(0, 8)}.webp`;
    imgRef[`$img:${key}`] = path;
    const known = await rest<unknown[]>("GET", `media_assets?select=id&${T}&storage_path=eq.${encodeURIComponent(path)}`);
    if (known.length) continue;
    const img = await toWebp(await download(h!.url), key.startsWith("hero") ? 2400 : 1600);
    await upload(path, img.bytes, "image/webp");
    assetRows.push({ tenant_id: tenantId, storage_path: path, mime_type: "image/webp", bytes: img.bytes.length, width: img.width, height: img.height, alt_text: h!.title?.slice(0, 200) ?? key, filename: `${key}.webp`, folder: "banners" });
  }
  // Favicon: monogram in the default theme's colours
  const c = theme.preset.tokens.colors as Record<string, string>;
  const favPath = `tenant/${tenantId}/brand/favicon.png`;
  const fav = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="30" fill="${c.primary}"/><text x="64" y="84" text-anchor="middle" font-family="Helvetica, Arial" font-weight="700" font-size="64" fill="${c.background}">${s.name[0]}</text></svg>`)).resize(128).png().toBuffer();
  await upload(favPath, fav, "image/png");
  const knownFav = await rest<unknown[]>("GET", `media_assets?select=id&${T}&storage_path=eq.${encodeURIComponent(favPath)}`);
  if (!knownFav.length) assetRows.push({ tenant_id: tenantId, storage_path: favPath, mime_type: "image/png", bytes: fav.length, width: 128, height: 128, alt_text: `${s.name} icon`, filename: "favicon.png", folder: "brand" });
  if (assetRows.length) await rest("POST", "media_assets", assetRows);
  await rest("PATCH", `stores?${T}`, { favicon_path: favPath });

  // Category / collection tiles: a product photo, preferring one no other tile uses yet.
  const usedTile = new Set<string>();
  const tileFor = (match: (p: ShowProduct) => boolean) => {
    const idx = s.products.map((p, i) => (match(p) ? i : -1)).filter((i) => i >= 0);
    const i = idx.find((k) => !usedTile.has(front[k]!)) ?? idx[0] ?? -1;
    if (i >= 0) usedTile.add(front[i]!);
    return i;
  };
  const catImg: Record<string, string> = {};
  for (const cat of s.categories) {
    const i = tileFor((p) => p.category === cat.slug);
    if (i < 0) continue;
    catImg[`$catimg:${cat.slug}`] = front[i]!;
    await rest("PATCH", `categories?id=eq.${catId[cat.slug]}`, { image_path: front[i] });
  }
  const colImg: Record<string, string> = {};
  for (const col of s.collections) {
    const i = tileFor((p) => !!(p.collections?.includes(col.slug) || (col.tag && p.tags.includes(col.tag))));
    if (i < 0) continue;
    colImg[`$colimg:${col.slug}`] = front[i]!;
    await rest("PATCH", `collections?id=eq.${colId[col.slug]}`, { image_path: front[i] });
  }

  // Menus, pages, FAQs (only when absent)
  const menus = await rest<{ id: string; handle: string }[]>("GET", `menus?select=id,handle&${T}`);
  if (!menus.length) {
    const made = await rest<{ id: string; handle: string }[]>("POST", "menus", [
      { tenant_id: tenantId, handle: "main", title: "Main menu" },
      { tenant_id: tenantId, handle: "shop", title: "Shop" },
      { tenant_id: tenantId, handle: "footer", title: "Help" },
    ]);
    const m = Object.fromEntries(made.map((x) => [x.handle, x.id]));
    for (const [i, item] of s.menu.entries()) {
      const [parent] = await rest<{ id: string }[]>("POST", "menu_items", { tenant_id: tenantId, menu_id: m.main, title: item.title, link_type: "url", url: item.to, position: i + 1, highlight: false });
      if (item.children?.length) await rest("POST", "menu_items", item.children.map((ch, j) => ({ tenant_id: tenantId, menu_id: m.main, parent_id: parent!.id, title: ch.title, link_type: "url", url: ch.to, position: j + 1, highlight: false })));
    }
    await rest("POST", "menu_items", s.categories.map((cat, i) => ({ tenant_id: tenantId, menu_id: m.shop, title: cat.name, link_type: "url", url: `/categories/${cat.slug}`, position: i + 1, highlight: false })));
    await rest(
      "POST",
      "menu_items",
      [["About us", "/pages/about"], ["Shipping", "/pages/shipping-policy"], ["Returns", "/pages/returns"], ["FAQ", "/faq"], ["Contact", "/pages/contact"], ["Privacy", "/pages/privacy"], ["Image credits", "/pages/image-credits"]].map(([title, url], i) => ({ tenant_id: tenantId, menu_id: m.footer, title, link_type: "url", url, position: i + 1, highlight: false })),
    );
  }
  const para = (text: string) => ({ type: "paragraph", text });
  const now = new Date().toISOString();
  const pages = [
    { title: "About us", slug: "about", kind: "about", body: s.story.map(para) },
    { title: "Shipping policy", slug: "shipping-policy", kind: "policy", body: [para(s.shippingNote), para("You'll receive tracking details by SMS and email as soon as your order ships.")] },
    { title: "Returns & replacements", slug: "returns", kind: "policy", body: [para(s.returnsNote), para(`To start a return, open the order in your account or write to ${s.email}.`)] },
    { title: "Contact us", slug: "contact", kind: "contact", body: [para(`Write to ${s.email} or call ${s.phone}, Monday to Saturday, 10 am – 6 pm IST.`), para(`${s.address.line1}, ${s.address.city}, ${s.address.state} ${s.address.postal_code}.`)] },
    { title: "Privacy policy", slug: "privacy", kind: "policy", body: [para(`${s.legalName} uses your details only to process orders, provide support and, if you opt in, send updates. We never sell personal data.`)] },
    {
      title: "Image credits",
      slug: "image-credits",
      kind: "page",
      body: [
        para(`${s.name} is a demo store. Its photographs come from Openverse and are public domain (CC0 / PDM) or licensed CC BY; product names, prices and descriptions are illustrative.`),
        ...credits.map((cr) => para(`${cr.what}: "${cr.hit.title || "Untitled"}" by ${cr.hit.creator || "unknown"} (${cr.hit.source}, ${cr.hit.license.toUpperCase()}${cr.hit.license_version ? ` ${cr.hit.license_version}` : ""}) — ${cr.hit.foreign_landing_url}`)),
      ],
    },
  ];
  const havePages = new Set((await rest<{ slug: string }[]>("GET", `pages?select=slug&${T}`)).map((p) => p.slug));
  const addPages = pages.filter((p) => !havePages.has(p.slug));
  if (addPages.length) await rest("POST", "pages", addPages.map((p) => ({ tenant_id: tenantId, ...p, status: "published", published_at: now })));
  if (!(await rest<unknown[]>("GET", `faqs?select=id&${T}&limit=1`)).length) await rest("POST", "faqs", s.faqs.map(([q, a], i) => ({ tenant_id: tenantId, question: q, answer: a, position: i + 1 })));

  // Theme: a content pool with every slot the industry's themes use, published with the default theme.
  const versions = await rest<{ id: string }[]>("GET", `theme_versions?select=id&${T}`);
  if (versions.length && !opts.retheme) {
    console.log("  theme exists (use --retheme to rebuild it)");
  } else {
    if (versions.length) await rest("DELETE", `theme_versions?${T}`); // this demo tenant only
    const refs: Record<string, string> = { ...imgRef, ...catImg, ...colImg };
    for (const [slug, id] of Object.entries(catId)) refs[`$category:${slug}`] = id;
    for (const [slug, id] of Object.entries(colId)) refs[`$collection:${slug}`] = id;
    front.forEach((p, i) => (refs[`$product:${i}`] = p));
    productIds.forEach((p, i) => (refs[`$productId:${i}`] = p));
    const slot = (name: string, [type, settings]: Slot, hidden = false) => section(`slot-${name}`, type, resolve(settings, refs) as Record<string, unknown>, hidden ? { desktop: false, mobile: false } : { desktop: true, mobile: true });
    // Slots referenced by product/collection templates of this industry's themes.
    const industryThemes = MARKETPLACE_THEMES.filter((t) => t.industry === s.industry);
    const templateSlots = (k: "product" | "collection") => [...new Set(industryThemes.flatMap((t) => (t.preset[k] ?? []).map((x) => x[2]).filter((x): x is string => !!x && !!s.slots[x])))];
    const pool = resolveThemeConfig({
      schemaVersion: 1,
      tokens: theme.preset.tokens,
      header: { menuHandle: "main", ...theme.preset.header },
      productCard: theme.preset.productCard,
      layout: {
        header: [
          section("announcement-1", "AnnouncementBar", { messages: s.announcement.slice(0, 3).map((text) => ({ text, href: "" })) }),
          section("header-1", "Header", {}),
          section("megamenu-1", "MegaMenu", { menuHandle: "main" }, { desktop: true, mobile: false }),
        ],
        footer: [section("footer-1", "Footer", { menuHandles: ["shop", "footer"], about: s.tagline, showContact: true, showSocial: false, showPaymentNote: true, showNewsletter: false })],
      },
      templates: {
        home: Object.entries(s.slots).map(([name, sl]) => slot(name, sl)),
        collection: templateSlots("collection").map((n) => slot(n, s.slots[n]!, true)),
        product: templateSlots("product").map((n) => slot(n, s.slots[n]!, true)),
      },
    });
    if (pool.issues.length) console.warn("  pool issues:", pool.issues.slice(0, 5));
    const applied = resolveThemeConfig(applyThemePreset(pool.config, theme.preset));
    if (applied.issues.length) console.warn("  theme issues:", applied.issues.slice(0, 5));
    await rest("POST", "theme_versions", [
      { tenant_id: tenantId, version: 1, status: "draft", label: "Draft", config: applied.config, published_at: null },
      { tenant_id: tenantId, version: 2, status: "published", label: theme.name, config: applied.config, published_at: now },
    ]);
  }
  console.log(`  ✓ ${s.products.length} products · http://${s.slug}.${ROOT}${ROOT === "localhost" ? ":3000" : ""}  (owner@${s.slug}.test, sign in via magic link)`);
}

async function saveProduct(s: ShowcaseSpec, p: ShowProduct, i: number, prefix: string, tenantId: string, token: string, catId: Record<string, string>): Promise<string> {
  const options = (p.options ?? []).slice(0, 2).map(([name, values]) => ({ name, values: values.map((v) => ({ value: v.split("|")[0]!, swatch: v.split("|")[1] ?? "" })) }));
  const lists = options.map((o) => o.values.map((v) => v.value));
  const combos: (string | null)[][] = lists.length === 0 ? [[null, null]] : lists.length === 1 ? lists[0]!.map((a) => [a, null]) : lists[0]!.flatMap((a) => lists[1]!.map((b) => [a, b]));
  const base = p.title.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  const code = (v: string | null) => (v ? `-${v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5)}` : "");
  const input = productInputSchema.parse({
    title: p.title,
    slug: slugify(p.title),
    description: p.description,
    shortDescription: p.short,
    productType: p.type ?? "other",
    brand: p.brand ?? s.name,
    categoryId: catId[p.category],
    status: "active",
    featured: Boolean(p.featured),
    tags: p.tags,
    attributes: { specs: p.specs.map(([label, value]) => ({ label, value })) },
    careInstructions: p.care ?? "",
    shippingInfo: s.shippingNote,
    returnInfo: s.returnsNote,
    hsnCode: p.hsn,
    seoTitle: `${p.title} | ${s.name}`.slice(0, 120),
    seoDescription: p.short,
    options,
    variants: combos.map(([a, b], k) => ({
      option1: a,
      option2: b,
      sku: `${prefix}-${base}${i + 1}${code(a ?? null)}${code(b ?? null)}`,
      price: String(p.price),
      compareAtPrice: p.mrp ? String(p.mrp) : "",
      weightGrams: String(p.weightGrams),
      trackInventory: true,
      lowStockThreshold: "3",
      initialStock: String(stockFor(`${p.title}:${a}:${b}`, i + k)),
    })),
  });
  return http<string>("POST", "/rest/v1/rpc/save_product", { token, body: { p_tenant: tenantId, p_payload: toSaveProductPayload(input, { allowInitialStock: true }) } });
}

const args = process.argv.slice(2);
const slugs = args.filter((a) => !a.startsWith("--"));
if (!slugs.length) throw new Error(`usage: run.mts <slug …> [--retheme]   (showcase: ${Object.keys(SHOWCASE_STORES).join(", ")})`);
for (const slug of slugs) await build(await loadSpec(slug), { retheme: args.includes("--retheme"), refreshImages: args.includes("--refresh-images") });
console.log("done");
