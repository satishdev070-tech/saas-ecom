/**
 * DEV ONLY — creates the 10 demo storefronts (scripts/dev/demo-stores/stores-*.ts) with owners,
 * catalogue, imagery, content and a published theme each.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/demo-stores/run.mts [slug …]
 *
 * Stores whose slug already exists are skipped (delete the tenant to rebuild it).
 * Products go through the real save_product RPC as the store owner (same validation as the
 * dashboard); everything else is written with the secret key. Never run against production.
 */
import { createRequire } from "node:module";
import { productSvg, bannerSvg } from "../demo-media/art.mjs";
import { resolveThemeConfig } from "../../../src/features/theme/schema/config";
import { defaultSettings } from "../../../src/features/theme/sections/definitions";
import type { SectionType } from "../../../src/features/theme/sections/types";
import { productInputSchema, toSaveProductPayload } from "../../../src/features/catalog/schemas";
import { STORES_A } from "./stores-a";
import { STORES_B } from "./stores-b";
import type { ProductSpec, StoreSpec } from "./types";

type Sharp = (input: Buffer) => { resize(w: number, h?: number): { webp(o: { quality: number }): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }> }; png(): { toBuffer(): Promise<Buffer> } } };
const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp") as Sharp;

/** Reads an env var, expanding a "$OTHER_VAR" reference the way Next.js's dotenv does (Node's --env-file doesn't). */
function env(name: string): string {
  const v = process.env[name] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUBLISHABLE = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const ROOT = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? "localhost";
const PASSWORD = "Paliya@12345"; // dev seed accounts only (same as supabase/seed.sql)
if (!URL_ || !SECRET || !PUBLISHABLE) throw new Error("Supabase env vars are required");

const OWNER_NAMES: Record<string, string> = {
  chinar: "Mehvish Qadri", gulaabrang: "Riya Saxena", pinkcity: "Kanika Jain", mitti: "Tara Rathore", rangeela: "Vivek Agarwal",
  noor: "Sana Kapoor", vivaah: "Devyani Singh", studioneel: "Neel Menon", desidrip: "Aryan Shah", anaya: "Anaya Mehra",
};
const ANNOUNCE_TONE: Record<string, string> = { gulaabrang: "accent", rangeela: "accent", desidrip: "dark", noor: "muted", mitti: "muted", studioneel: "light", pinkcity: "dark" };
const INLINE_MENU = new Set(["studioneel", "rangeela", "desidrip", "mitti"]);
const SILHOUETTE: Record<ProductSpec["type"], string> = {
  kurta: "kurtaStraight", kurta_set: "suitSet", suit: "suitSet", co_ord_set: "coord", dress: "dress", saree: "saree", lehenga: "lehenga",
  top: "tee", shirt: "jacket", bottom: "palazzoSet", dupatta: "dupatta", accessory: "shawl", other: "jacket",
};
const HSN: Record<ProductSpec["type"], string> = {
  kurta: "6204", kurta_set: "6204", suit: "6204", co_ord_set: "6204", dress: "6204", saree: "5007", lehenga: "6204",
  top: "6109", shirt: "6206", bottom: "6204", dupatta: "6214", accessory: "6214", other: "6202",
};
const SIZES = { apparel: ["XS", "S", "M", "L", "XL", "XXL"], standard: ["S", "M", "L", "XL"], free: [] as string[] };

// ------------------------------------------------------------------ HTTP helpers

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: opts.token ? PUBLISHABLE : SECRET,
      Authorization: `Bearer ${opts.token ?? SECRET}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer ?? "return=representation",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}
function rest<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  return http<T>(method, `/rest/v1/${path}`, { body, token });
}

async function upload(path: string, bytes: Buffer, type: string) {
  const res = await fetch(`${URL_}/storage/v1/object/store-assets/${path}`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": type, "x-upsert": "true", "cache-control": "31536000" },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`upload ${path} → ${res.status} ${await res.text()}`);
}

async function ownerSession(slug: string, name: string): Promise<{ token: string; userId: string }> {
  const email = `owner@${slug}.test`;
  try {
    await http("POST", "/auth/v1/admin/users", { body: { email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name } } });
  } catch (e) {
    if (!String(e).includes("422")) throw e; // already exists
  }
  // A just-created account can take a moment to accept password sign-in: retry briefly.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
    const j = (await res.json()) as { access_token?: string; user?: { id: string }; msg?: string; error_description?: string };
    if (j.access_token && j.user) return { token: j.access_token, userId: j.user.id };
    if (attempt === 5) throw new Error(`sign-in failed for ${email}: ${j.error_description ?? j.msg ?? res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  throw new Error("unreachable");
}

// ------------------------------------------------------------------ helpers

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}
function stockFor(title: string, size: string, i: number): number {
  if (size === "XXL" && i % 4 === 2) return 0; // a sold-out size, as in real stores
  if (size === "XS") return 2; // low stock
  return 4 + (hash(`${title}:${size}`) % 18);
}

async function render(svg: string, width: number) {
  const out = await sharp(Buffer.from(svg)).resize(width).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  return { bytes: out.data, width: out.info.width, height: out.info.height };
}

/** Replaces "$collection:x" / "$category:x" / "$img:x" / "$product:i" / "$productId:i" placeholders. */
function resolve(value: unknown, refs: Record<string, string>): unknown {
  if (typeof value === "string" && value.startsWith("$")) return refs[value] ?? "";
  if (Array.isArray(value)) return value.map((v) => resolve(v, refs));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, refs)]));
  return value;
}

let sectionSeq = 0;
function section(type: string, settings: Record<string, unknown>, visibility = { desktop: true, mobile: true }) {
  sectionSeq += 1;
  return { id: `${type.toLowerCase()}-${sectionSeq}`, type, settings: { ...defaultSettings(type as SectionType), ...settings }, visibility };
}

// ------------------------------------------------------------------ one store

async function buildStore(s: StoreSpec) {
  const existing = await rest<{ id: string }[]>("GET", `tenants?select=id&slug=eq.${s.slug}`);
  // A store with a theme is finished; one without is a run that stopped part-way: resume it.
  if (existing.length) {
    const themes = await rest<unknown[]>("GET", `theme_versions?select=id&tenant_id=eq.${existing[0]!.id}&limit=1`);
    if (themes.length) {
      console.log(`• ${s.name}: already exists, skipped`);
      return;
    }
  }
  console.log(`${existing.length ? "↻ resuming" : "▶"} ${s.name}`);
  const owner = await ownerSession(s.slug, OWNER_NAMES[s.slug] ?? "Store Owner");
  const tenantId = existing[0]?.id ?? (await http<string>("POST", "/rest/v1/rpc/create_tenant", { token: owner.token, body: { p_name: s.name, p_slug: s.slug, p_root_domain: ROOT } }));
  const plan = await rest<{ id: string }[]>("GET", `plans?select=id&code=eq.${["anaya", "vivaah", "chinar"].includes(s.slug) ? "scale" : "growth"}`);
  await rest("PATCH", `tenants?id=eq.${tenantId}`, { status: "active", trial_ends_at: null, plan_id: plan[0]?.id ?? null });
  await rest("PATCH", `stores?tenant_id=eq.${tenantId}`, {
    tagline: s.tagline,
    email: s.email,
    phone: s.phone,
    address: { ...s.address, country: "IN" },
    social: s.social,
    gstin: s.gstin ?? null,
    legal_name: s.legalName,
    seo: s.seo,
  });

  // Catalogue structure
  const oldChart = await rest<{ id: string }[]>("GET", `size_charts?select=id&tenant_id=eq.${tenantId}&name=eq.Standard%20sizes`);
  const chart = oldChart.length ? oldChart : await rest<{ id: string }[]>("POST", "size_charts", {
    tenant_id: tenantId,
    name: "Standard sizes",
    unit: "in",
    chart: { columns: ["Size", "Bust", "Waist", "Hip", "Length"], rows: [["XS", "32", "26", "35", "44"], ["S", "34", "28", "37", "44"], ["M", "36", "30", "39", "45"], ["L", "38", "32", "41", "45"], ["XL", "40", "34", "43", "46"], ["XXL", "42", "36", "45", "46"]], note: "Garment measurements in inches. Between sizes? Choose the larger one for a relaxed fit." },
  });
  const oldCats = await rest<{ id: string; slug: string }[]>("GET", `categories?select=id,slug&tenant_id=eq.${tenantId}`);
  const newCats = s.categories.filter((c) => !oldCats.some((o) => o.slug === c.slug));
  const categories = [...oldCats, ...(newCats.length ? await rest<{ id: string; slug: string }[]>("POST", "categories", newCats.map((c) => ({ tenant_id: tenantId, name: c.name, slug: c.slug, description: c.description, position: s.categories.indexOf(c) + 1 }))) : [])];
  const catId = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  const oldCols = await rest<{ id: string; slug: string }[]>("GET", `collections?select=id,slug&tenant_id=eq.${tenantId}`);
  const newCols = s.collections.filter((c) => !oldCols.some((o) => o.slug === c.slug));
  const collections = [...oldCols, ...(newCols.length ? await rest<{ id: string; slug: string }[]>(
    "POST",
    "collections",
    newCols.map((c) => ({
      tenant_id: tenantId,
      title: c.title,
      slug: c.slug,
      description: c.description,
      type: c.rules ? "automated" : "manual",
      rules: { match: "all", conditions: c.rules ? [{ field: "tag", op: "eq", value: c.rules.tag }] : [] },
      sort_order: c.rules ? "newest" : "manual",
      position: s.collections.indexOf(c) + 1,
    })),
  ) : [])];
  const colId = Object.fromEntries(collections.map((c) => [c.slug, c.id]));

  // Products (real save_product RPC, as the owner)
  const productIds: string[] = [];
  const oldProducts = await rest<{ id: string; slug: string }[]>("GET", `products?select=id,slug&tenant_id=eq.${tenantId}`);
  for (const [i, p] of s.products.entries()) {
    const done = oldProducts.find((o) => o.slug === slugify(p.title));
    if (done) {
      productIds.push(done.id);
      continue;
    }
    const sizes = SIZES[p.sizes];
    const options = [
      ...(sizes.length ? [{ name: "Size", values: sizes.map((v) => ({ value: v })) }] : []),
      ...(p.colors?.length ? [{ name: "Colour", values: p.colors.map((c) => ({ value: c.name, swatch: c.hex })) }] : []),
    ];
    const base = p.title.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
    const sku = `${s.slug.slice(0, 3).toUpperCase()}-${base}${i + 1}`;
    const combos: { o1: string | null; o2: string | null }[] = sizes.length
      ? sizes.flatMap((sz): { o1: string | null; o2: string | null }[] => (p.colors?.length ? p.colors.map((c) => ({ o1: sz, o2: c.name })) : [{ o1: sz, o2: null }]))
      : p.colors?.length
        ? p.colors.map((c) => ({ o1: c.name, o2: null }))
        : [{ o1: null, o2: null }];
    const input = productInputSchema.parse({
      title: p.title,
      slug: slugify(p.title),
      description: p.description,
      shortDescription: p.short,
      productType: p.type,
      brand: s.name,
      categoryId: catId[p.category],
      sizeChartId: sizes.length ? chart[0]!.id : undefined,
      status: "active",
      featured: Boolean(p.featured),
      tags: p.tags,
      attributes: { fabric: p.fabric, work: p.work, occasion: p.occasion },
      careInstructions: p.type === "saree" || p.type === "lehenga" || p.type === "accessory" ? "Dry clean only. Store folded in muslin." : "Gentle hand wash in cold water. Dry in shade. Warm iron on the reverse.",
      shippingInfo: s.shippingNote,
      returnInfo: s.returnsNote,
      hsnCode: HSN[p.type],
      seoTitle: `${p.title} | ${s.name}`.slice(0, 120),
      seoDescription: p.short,
      options,
      variants: combos.map((c) => ({
        option1: c.o1,
        option2: c.o2,
        sku: `${sku}${c.o1 ? `-${c.o1.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}` : ""}${c.o2 ? `-${c.o2.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)}` : ""}`,
        price: p.price,
        compareAtPrice: p.mrp ?? null,
        weightGrams: p.type === "lehenga" ? 2500 : p.type === "saree" ? 900 : 450,
        trackInventory: true,
        lowStockThreshold: 3,
        initialStock: stockFor(p.title, c.o1 ?? "one", i),
      })),
    });
    const id = await http<string>("POST", "/rest/v1/rpc/save_product", { token: owner.token, body: { p_tenant: tenantId, p_payload: toSaveProductPayload(input, { allowInitialStock: true }) } });
    productIds.push(id);
  }

  // Manual collection membership
  for (const c of s.collections.filter((x) => !x.rules)) {
    const ids = s.products.map((p, i) => (p.collections?.includes(c.slug) ? productIds[i] : null)).filter((x): x is string => Boolean(x));
    if (ids.length) await http("POST", "/rest/v1/rpc/set_collection_products", { token: owner.token, body: { p_collection: colId[c.slug], p_product_ids: ids } });
  }

  // Imagery
  const front: string[] = [];
  const mediaRows: Record<string, unknown>[] = [];
  const assetRows: Record<string, unknown>[] = [];
  for (const [i, p] of s.products.entries()) {
    const art = { silhouette: p.art.silhouette ?? SILHOUETTE[p.type], print: p.art.print, colors: p.art.colors, backdrop: s.backdrop };
    const views = [
      { view: "front", alt: `${p.title}: ${p.short.replace(/\.$/, "")}` },
      { view: "back", alt: `${p.title}, closer view` },
      { view: "detail", alt: `Fabric detail of the ${p.title}` },
    ] as const;
    for (const [k, v] of views.entries()) {
      const img = await render(productSvg({ ...art, view: v.view }), 1200);
      const path = `tenant/${tenantId}/products/demo-${slugify(p.title)}-${v.view}.webp`;
      await upload(path, img.bytes, "image/webp");
      if (k === 0) front.push(path);
      mediaRows.push({ tenant_id: tenantId, product_id: productIds[i], storage_path: path, alt_text: v.alt, width: img.width, height: img.height, position: k, media_type: "image" });
      assetRows.push({ tenant_id: tenantId, storage_path: path, mime_type: "image/webp", bytes: img.bytes.length, width: img.width, height: img.height, alt_text: v.alt, filename: `${slugify(p.title)}-${v.view}.webp`, folder: "products" });
    }
  }
  await rest("POST", "product_media", mediaRows);

  const panelOf = (p: ProductSpec) => ({ ...p.art.colors, print: p.art.print });
  const put = async (name: string, svg: string, width: number, alt: string, folder = "banners") => {
    const img = await render(svg, width);
    const path = `tenant/${tenantId}/theme/demo-${name}.webp`;
    await upload(path, img.bytes, "image/webp");
    assetRows.push({ tenant_id: tenantId, storage_path: path, mime_type: "image/webp", bytes: img.bytes.length, width: img.width, height: img.height, alt_text: alt, filename: `${name}.webp`, folder });
    return path;
  };
  const heroPanels = s.products.slice(0, 4).map(panelOf);
  const img: Record<string, string> = {
    "$img:hero": await put("hero", bannerSvg({ panels: heroPanels, backdrop: s.bannerBackdrop }), 2400, `${s.name}: ${s.hero.heading}`),
    "$img:heroMobile": await put("hero-mobile", bannerSvg({ panels: heroPanels.slice(0, 2), backdrop: s.bannerBackdrop, width: 1200, height: 1500, textSide: "right" }), 1200, s.hero.heading),
    "$img:editorial": await put("editorial", productSvg({ silhouette: "kurtaStraight", print: s.products[1 % s.products.length]!.art.print, colors: s.products[1 % s.products.length]!.art.colors, backdrop: s.backdrop, view: "detail" }), 1400, "Close-up of the craft", "content"),
    "$img:story": await put("story", productSvg({ silhouette: s.products[2 % s.products.length]!.art.silhouette ?? SILHOUETTE[s.products[2 % s.products.length]!.type], print: s.products[2 % s.products.length]!.art.print, colors: s.products[2 % s.products.length]!.art.colors, backdrop: s.backdrop, view: "back" }), 1400, "From the studio", "content"),
  };
  // Favicon: a small textile motif in the brand colours
  const t = s.tokens.colors as Record<string, string>;
  const fav = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="${t.primary}"/><g transform="translate(64 64)" fill="${t.accent}">${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="0" cy="-24" rx="10" ry="18" transform="rotate(${a})"/>`).join("")}<circle r="11" fill="${t.background}"/></g></svg>`)).resize(128).png().toBuffer();
  const favPath = `tenant/${tenantId}/brand/favicon.png`;
  await upload(favPath, fav, "image/png");
  assetRows.push({ tenant_id: tenantId, storage_path: favPath, mime_type: "image/png", bytes: fav.length, width: 128, height: 128, alt_text: `${s.name} icon`, filename: "favicon.png", folder: "brand" });
  await rest("POST", "media_assets", assetRows);
  await rest("PATCH", `stores?tenant_id=eq.${tenantId}`, { favicon_path: favPath });

  // Category / collection tiles
  for (const c of s.categories) {
    const i = s.products.findIndex((p) => p.category === c.slug);
    if (i >= 0) await rest("PATCH", `categories?id=eq.${catId[c.slug]}`, { image_path: front[i] });
  }
  for (const c of s.collections) {
    const i = s.products.findIndex((p) => p.collections?.includes(c.slug) || (c.rules && p.tags.includes(c.rules.tag)));
    if (i >= 0) await rest("PATCH", `collections?id=eq.${colId[c.slug]}`, { image_path: front[i] });
  }

  // Menus: main (with children for the mega menu), shop + help footers
  const menus = await rest<{ id: string; handle: string }[]>("POST", "menus", [
    { tenant_id: tenantId, handle: "main", title: "Main menu" },
    { tenant_id: tenantId, handle: "shop", title: "Shop" },
    { tenant_id: tenantId, handle: "footer", title: "Help" },
  ]);
  const menuId = Object.fromEntries(menus.map((m) => [m.handle, m.id]));
  for (const [i, m] of s.menu.entries()) {
    const [parent] = await rest<{ id: string }[]>("POST", "menu_items", { tenant_id: tenantId, menu_id: menuId.main, title: m.title, link_type: m.to ? "url" : "url", url: m.to ?? "/collections", position: i + 1, highlight: Boolean(m.highlight) });
    if (m.children?.length) {
      await rest("POST", "menu_items", m.children.map((c, j) => ({ tenant_id: tenantId, menu_id: menuId.main, parent_id: parent!.id, title: c.title, link_type: "url", url: c.to, position: j + 1, highlight: false })));
    }
  }
  await rest("POST", "menu_items", s.categories.map((c, i) => ({ tenant_id: tenantId, menu_id: menuId.shop, title: c.name, link_type: "url", url: `/categories/${c.slug}`, position: i + 1, highlight: false })));
  await rest("POST", "menu_items", [
    ["About us", "/pages/about"],
    ["Shipping", "/pages/shipping-policy"],
    ["Returns & exchanges", "/pages/returns"],
    ["FAQ", "/faq"],
    ["Contact", "/pages/contact"],
    ["Privacy", "/pages/privacy"],
  ].map(([title, url], i) => ({ tenant_id: tenantId, menu_id: menuId.footer, title, link_type: "url", url, position: i + 1, highlight: false })));

  // Pages, FAQs, reviews
  const para = (text: string) => ({ type: "paragraph", text });
  const now = new Date().toISOString();
  await rest("POST", "pages", [
    { tenant_id: tenantId, title: "Our story", slug: "about", kind: "about", status: "published", published_at: now, body: [para(s.story), para(s.tagline + ".")] },
    { tenant_id: tenantId, title: "Shipping policy", slug: "shipping-policy", kind: "policy", status: "published", published_at: now, body: [para(s.shippingNote), para("You'll receive tracking details by SMS and email as soon as your order ships.")] },
    { tenant_id: tenantId, title: "Returns & exchanges", slug: "returns", kind: "policy", status: "published", published_at: now, body: [para(s.returnsNote), para(`To start a return, open the order in your account or write to ${s.email}.`)] },
    { tenant_id: tenantId, title: "Contact us", slug: "contact", kind: "contact", status: "published", published_at: now, body: [para(`Write to ${s.email} or call ${s.phone}, Monday to Saturday, 10 am – 6 pm IST.`), para(`${s.address.line1}, ${s.address.city}, ${s.address.state} ${s.address.postal_code}.`)] },
    { tenant_id: tenantId, title: "Privacy policy", slug: "privacy", kind: "policy", status: "published", published_at: now, body: [para(`${s.legalName} uses your details only to process orders, provide support and, if you opt in, send updates. We never sell personal data.`)] },
  ]);
  await rest("POST", "faqs", s.faqs.map(([q, a], i) => ({ tenant_id: tenantId, question: q, answer: a, position: i + 1 })));
  await rest("POST", "reviews", s.reviews.map((r) => ({ tenant_id: tenantId, product_id: productIds[r.product], rating: r.rating, title: r.title, body: r.body, author_name: r.author, status: "approved", verified_purchase: true })));

  // Theme
  const refs: Record<string, string> = { ...img };
  for (const [slug, id] of Object.entries(colId)) refs[`$collection:${slug}`] = id;
  for (const [slug, id] of Object.entries(catId)) refs[`$category:${slug}`] = id;
  front.forEach((p, i) => (refs[`$product:${i}`] = p));
  productIds.forEach((p, i) => (refs[`$productId:${i}`] = p));
  refs["$img:promo1"] = front[1 % front.length]!;
  refs["$img:promo2"] = front[4 % front.length]!;
  refs["$img:promo3"] = front[3 % front.length]!;

  const inline = INLINE_MENU.has(s.slug);
  const upper = s.tokens.headingCase === "uppercase";
  const home = s.home.map(([type, settings]) => {
    let st = resolve(settings, refs) as Record<string, unknown>;
    if (type === "Hero") {
      st = { ...st, slides: [{ imagePath: img["$img:hero"], mobileImagePath: img["$img:heroMobile"], alt: s.hero.heading, eyebrow: s.hero.eyebrow, heading: s.hero.heading, subheading: s.hero.subheading, ctaLabel: s.hero.ctaLabel, ctaHref: s.hero.ctaHref, align: s.hero.align, textTone: s.hero.textTone }] };
    }
    if (type === "Testimonials") st = { ...st, items: s.testimonials.map((t) => ({ quote: t.quote, author: t.name, location: t.place, rating: 5 })) };
    if (type === "SocialProof") st = { ...st, posts: front.slice(0, 6).map((p, i) => ({ imagePath: p, alt: s.products[i]!.title, href: (st.profileUrl as string) || "" })) };
    if (type === "Lookbook") st = { ...st, looks: front.slice(0, 5).map((p, i) => ({ imagePath: p, alt: s.products[i]!.title, caption: s.products[i]!.title, productId: productIds[i] })) };
    return section(type, st);
  });
  const config = resolveThemeConfig({
    schemaVersion: 1,
    tokens: s.tokens,
    header: { menuHandle: "main", ...s.header },
    productCard: s.productCard,
    layout: {
      header: [
        section("AnnouncementBar", { messages: s.announcement.slice(0, 3).map((text) => ({ text, href: "" })), tone: ANNOUNCE_TONE[s.slug] ?? "dark" }),
        section("Header", { layout: s.headerLayout, showInlineMenu: inline }),
        ...(inline ? [] : [section("MegaMenu", { menuHandle: "main", uppercase: upper, showImages: true }, { desktop: true, mobile: false })]),
      ],
      footer: [section("Footer", { menuHandles: ["shop", "footer"], about: s.tagline, tone: s.footerTone, showContact: true, showSocial: true, showPaymentNote: true })],
    },
    templates: {
      home,
      collection: [],
      product: [section("TrustBadges", { tone: "muted" })],
    },
  });
  if (config.issues.length) console.warn(`  theme issues for ${s.slug}:`, config.issues.slice(0, 5));
  await rest("POST", "theme_versions", [
    { tenant_id: tenantId, version: 1, status: "draft", label: "Draft", config: config.config, published_at: null },
    { tenant_id: tenantId, version: 2, status: "published", label: "Launch theme", config: config.config, published_at: now },
  ]);
  console.log(`  ✓ ${s.products.length} products, ${s.products.length * 3 + 5} images · http://${s.slug}.${ROOT}:3000  (owner@${s.slug}.test)`);
}

const only = process.argv.slice(2);
for (const s of [...STORES_A, ...STORES_B]) {
  if (only.length && !only.includes(s.slug)) continue;
  await buildStore(s);
}
console.log("done");
