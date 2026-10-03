/**
 * DEV ONLY — gives the seed stores original demo imagery and a published home page.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/dev/demo-media/run.mts
 *
 * Idempotent: images are upserted at fixed paths; DB rows are only added where missing
 * (products without media, categories/collections without an image, tenants without a theme).
 * Uses the secret key, so it refuses to run against anything but the seed tenants.
 */
import { createRequire } from "node:module";
import { productSvg, bannerSvg } from "./art.mjs";
import { DEFAULT_THEME_CONFIG } from "../../../src/features/theme/default-theme";

// sharp ships with Next (image optimisation); resolved through it so it isn't a direct dependency.
type Sharp = (input: Buffer) => { resize(width: number): { webp(o: { quality: number }): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }> } } };
const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp") as Sharp;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const AANGAN = "10000000-0000-4000-a000-00000000000a";
const RANGREZ = "10000000-0000-4000-a000-00000000000b";
const BUCKET = "store-assets";

type Colors = { ground: string; ink: string; accent: string; leaf: string; altGround?: string; altPrint?: string; drapePrint?: string; drapeGround?: string };
type Art = { silhouette: string; print: string; colors: Colors; backdrop: [string, string] };

const WARM: [string, string] = ["#f1ebe1", "#d8ccbc"];
const PRODUCTS: Record<string, { tenant: string; art: Art; alt: string }> = {
  "indigo-dabu-straight-kurta": { tenant: AANGAN, alt: "Indigo straight kurta with white dabu dot print", art: { silhouette: "kurtaStraight", print: "dabu", colors: { ground: "#23355e", ink: "#e9e2d0", accent: "#b24a3a", leaf: "#6f8a5b" }, backdrop: WARM } },
  "rose-sanganeri-a-line-kurta": { tenant: AANGAN, alt: "Ivory A-line kurta with rose Sanganeri floral buttis", art: { silhouette: "kurtaAline", print: "sanganeri", colors: { ground: "#f6ece6", ink: "#c9616c", accent: "#e4b04a", leaf: "#5f7f55" }, backdrop: ["#ece3d8", "#d3c4b3"] } },
  "mustard-bagru-suit-set": { tenant: AANGAN, alt: "Mustard Bagru print kurta with dark pants and ivory dupatta", art: { silhouette: "suitSet", print: "bagru", colors: { ground: "#d9a52e", ink: "#2c2118", accent: "#8f2f24", leaf: "#556b3a", altGround: "#2c2118", altPrint: "dabu", drapePrint: "vine", drapeGround: "#f3e6c4" }, backdrop: ["#efe7da", "#d4c6b1"] } },
  "ajrakh-mul-cotton-saree": { tenant: AANGAN, alt: "Madder red and indigo ajrakh print saree", art: { silhouette: "saree", print: "ajrakh", colors: { ground: "#7c1f22", ink: "#1f2a44", accent: "#e0b050", leaf: "#2f4a3a", altGround: "#1f2a44", altPrint: "dabu", drapePrint: "ajrakh", drapeGround: "#1f2a44" }, backdrop: ["#efe8de", "#d6c9b7"] } },
  "kota-doria-leheriya-dupatta": { tenant: AANGAN, alt: "Sheer Kota doria dupatta with multicolour leheriya waves and tassels", art: { silhouette: "dupatta", print: "leheriya", colors: { ground: "#f2d9c4", ink: "#cf4f6a", accent: "#e39a2d", leaf: "#3f8a86" }, backdrop: ["#f3ede4", "#dccfbf"] } },
  "sage-kalamkari-co-ord-set": { tenant: AANGAN, alt: "Sage green kalamkari print shirt and pant co-ord set", art: { silhouette: "coord", print: "kalamkari", colors: { ground: "#b7c2a3", ink: "#3d4a33", accent: "#9c4b2f", leaf: "#6a5a3a" }, backdrop: ["#eee9df", "#d2c9b8"] } },
  "madder-red-wrap-dress": { tenant: RANGREZ, alt: "Madder red wrap dress with fine ivory vine print", art: { silhouette: "dress", print: "vine", colors: { ground: "#a3342b", ink: "#f1e3cf", accent: "#e8b25a", leaf: "#f1e3cf" }, backdrop: ["#f0e9df", "#d7cbbb"] } },
};
/** Category / collection slug → product whose front image represents it. */
const CATEGORY_IMAGE: Record<string, string> = { kurtas: "rose-sanganeri-a-line-kurta", "suit-sets": "mustard-bagru-suit-set", sarees: "ajrakh-mul-cotton-saree", dupattas: "kota-doria-leheriya-dupatta", "co-ord-sets": "sage-kalamkari-co-ord-set" };
const COLLECTION_IMAGE: Record<string, string> = { "new-arrivals": "indigo-dabu-straight-kurta", bestsellers: "mustard-bagru-suit-set", "festive-edit": "ajrakh-mul-cotton-saree", sale: "kota-doria-leheriya-dupatta", "wedding-guest": "ajrakh-mul-cotton-saree" };

async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function upload(path: string, bytes: Buffer): Promise<void> {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "image/webp", "x-upsert": "true", "cache-control": "31536000" },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`upload ${path} → ${res.status} ${await res.text()}`);
}

async function render(svg: string, width: number): Promise<{ bytes: Buffer; width: number; height: number }> {
  const out = await sharp(Buffer.from(svg)).resize(width).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  return { bytes: out.data, width: out.info.width, height: out.info.height };
}

async function putImage(tenant: string, area: string, name: string, svg: string, width: number, alt: string) {
  const path = `tenant/${tenant}/${area}/demo-${name}.webp`;
  const img = await render(svg, width);
  await upload(path, img.bytes);
  const existing = await rest<unknown[]>("GET", `media_assets?select=id&storage_path=eq.${encodeURIComponent(path)}`);
  if (!existing.length) await rest("POST", "media_assets", { tenant_id: tenant, storage_path: path, mime_type: "image/webp", bytes: img.bytes.length, width: img.width, height: img.height, alt_text: alt });
  return { path, ...img };
}

async function main() {
  const tenants = await rest<{ id: string }[]>("GET", `tenants?select=id&id=in.(${AANGAN},${RANGREZ})`);
  if (tenants.length !== 2) throw new Error("Seed tenants not found — run supabase/seed.sql first.");

  // Products: front, fabric detail, closer crop
  const frontBySlug: Record<string, string> = {};
  const products = await rest<{ id: string; slug: string; tenant_id: string }[]>("GET", `products?select=id,slug,tenant_id&tenant_id=in.(${AANGAN},${RANGREZ})`);
  for (const p of products) {
    const spec = PRODUCTS[p.slug];
    if (!spec) continue;
    const views = [
      { view: "front", alt: spec.alt },
      { view: "back", alt: `${spec.alt}, closer view` },
      { view: "detail", alt: `Close-up of the ${spec.art.print} print` },
    ] as const;
    const imgs = [];
    for (const v of views) imgs.push(await putImage(p.tenant_id, "products", `${p.slug}-${v.view}`, productSvg({ ...spec.art, view: v.view }), 1200, v.alt));
    frontBySlug[p.slug] = imgs[0]!.path;
    const media = await rest<unknown[]>("GET", `product_media?select=id&product_id=eq.${p.id}`);
    if (!media.length) {
      await rest("POST", "product_media", imgs.map((m, i) => ({ tenant_id: p.tenant_id, product_id: p.id, storage_path: m.path, alt_text: views[i]!.alt, width: m.width, height: m.height, position: i })));
      console.log(`product ${p.slug}: ${imgs.length} images`);
    }
  }

  // Category + collection tiles
  for (const [table, map] of [["categories", CATEGORY_IMAGE], ["collections", COLLECTION_IMAGE]] as const) {
    const rows = await rest<{ id: string; slug: string; image_path: string | null }[]>("GET", `${table}?select=id,slug,image_path&tenant_id=eq.${AANGAN}`);
    for (const r of rows) {
      const product = map[r.slug];
      const src = product ? frontBySlug[product] : undefined;
      if (src && !r.image_path) {
        await rest("PATCH", `${table}?id=eq.${r.id}`, { image_path: src });
        console.log(`${table} ${r.slug}: image set`);
      }
    }
  }

  // Editorial imagery for the home page
  const panel = (slug: string) => ({ ...PRODUCTS[slug]!.art.colors, print: PRODUCTS[slug]!.art.print });
  const hero = await putImage(AANGAN, "theme", "hero-festive", bannerSvg({ panels: ["indigo-dabu-straight-kurta", "mustard-bagru-suit-set", "ajrakh-mul-cotton-saree", "kota-doria-leheriya-dupatta"].map(panel), backdrop: ["#e8dccb", "#3a2e25"] }), 2400, "Hand block printed fabrics hanging in the studio");
  const heroMobile = await putImage(AANGAN, "theme", "hero-festive-mobile", bannerSvg({ panels: ["ajrakh-mul-cotton-saree", "kota-doria-leheriya-dupatta"].map(panel), backdrop: ["#e8dccb", "#3a2e25"], width: 1200, height: 1500, textSide: "right" }), 1200, "Hand block printed fabrics");
  const craft = await putImage(AANGAN, "theme", "editorial-craft", productSvg({ ...PRODUCTS["indigo-dabu-straight-kurta"]!.art, view: "detail" }), 1200, "Close-up of indigo dabu hand block print");

  // About page (the default theme links to it)
  const about = await rest<unknown[]>("GET", `pages?select=id&tenant_id=eq.${AANGAN}&slug=eq.about`);
  if (!about.length) {
    await rest("POST", "pages", {
      tenant_id: AANGAN, title: "Our story", slug: "about", kind: "about", status: "published", published_at: new Date().toISOString(),
      body: [
        { type: "paragraph", text: "Aangan began in a courtyard workshop in Jaipur, where three generations of printers still carve their own teak blocks." },
        { type: "paragraph", text: "We print in small batches with natural dyes — indigo, madder, pomegranate rind and iron — so every piece carries the small irregularities of the hand." },
      ],
    });
    console.log("page about: created");
  }

  // Theme: publish the default config with imagery, only if the store has never saved a theme
  const themes = await rest<unknown[]>("GET", `theme_versions?select=id&tenant_id=eq.${AANGAN}`);
  if (!themes.length) {
    const config = structuredClone(DEFAULT_THEME_CONFIG) as unknown as { templates: { home: { type: string; settings: Record<string, unknown> }[] } };
    for (const s of config.templates.home) {
      if (s.type === "Hero") {
        s.settings.slides = [{ imagePath: hero.path, mobileImagePath: heroMobile.path, alt: "Hand block printed fabrics hanging in the studio", eyebrow: "New season", heading: "The festive edit", subheading: "Hand block printed in Jaipur, in small batches.", ctaLabel: "Shop the edit", ctaHref: "/collections/festive-edit", align: "left", textTone: "light" }];
        s.settings.overlay = 10;
      }
      if (s.type === "EditorialImageText") s.settings.imagePath = craft.path;
    }
    await rest("POST", "theme_versions", [
      { tenant_id: AANGAN, version: 1, status: "draft", label: "Draft", config, published_at: null },
      { tenant_id: AANGAN, version: 2, status: "published", label: "Demo imagery", config, published_at: new Date().toISOString() },
    ]);
    console.log("theme: published with demo imagery");
  }
  console.log("done");
}

await main();
