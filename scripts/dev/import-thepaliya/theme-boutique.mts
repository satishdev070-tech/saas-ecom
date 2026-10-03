/**
 * Applies the "Jaipur Boutique" marketplace theme to the-paliya and fills every section with the
 * store's own content (banners, categories, products). Everything stays editable in
 * Dashboard → Theme editor. Publishes the result (previous version stays in history for rollback).
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/import-thepaliya/theme-boutique.mts
 */
import { findMarketplaceTheme } from "../../../src/features/theme/marketplace/catalog";
import { applyThemePreset } from "../../../src/features/theme/marketplace/apply";
import { parseThemeConfigStrict, resolveThemeConfig, type ThemeConfig } from "../../../src/features/theme/schema/config";
import type { SectionInstance } from "../../../src/features/theme/sections/types";

function env(name: string): string {
  const v = process.env[name] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1).replace(/[{}]/g, "")] ?? "") : v;
}
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUBLISHABLE = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SLUG = "the-paliya";

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: opts.token ? PUBLISHABLE : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const rest = <T = unknown,>(method: string, path: string, body?: unknown) => http<T>(method, `/rest/v1/${path}`, { body });

async function ownerToken(tenantId: string): Promise<string> {
  const [m] = await rest<{ user_id: string }[]>("GET", `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&role=eq.owner&limit=1`);
  const user = await http<{ email: string }>("GET", `/auth/v1/admin/users/${m!.user_id}`);
  const link = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email: user.email } });
  const res = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.properties?.hashed_token ?? link.hashed_token }) });
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("could not open an owner session");
  return j.access_token;
}

const [tenant] = await rest<{ id: string }[]>("GET", `tenants?select=id&slug=eq.${SLUG}`);
if (!tenant) throw new Error("tenant not found");
const T = tenant.id;
const token = await ownerToken(T);
const theme = findMarketplaceTheme("jaipur-boutique")!;

// Store data used to fill the sections.
const [store] = await rest<{ name: string; whatsapp: string | null; cod_settings: { enabled?: boolean } }[]>("GET", `stores?select=name,whatsapp,cod_settings&tenant_id=eq.${T}`);
const cats = await rest<{ id: string; slug: string; name: string; parent_id: string | null; image_path: string | null; position: number }[]>("GET", `categories?select=id,slug,name,parent_id,image_path,position&tenant_id=eq.${T}&status=eq.active&order=position`);
const cols = await rest<{ id: string; slug: string }[]>("GET", `collections?select=id,slug&tenant_id=eq.${T}`);
const products = await rest<{ id: string; category_id: string | null; product_media: { storage_path: string; position: number }[] }[]>("GET", `products?select=id,category_id,product_media(storage_path,position)&tenant_id=eq.${T}&status=eq.active`);
const col = (slug: string) => cols.find((c) => c.slug === slug)?.id ?? "";
const cat = (slug: string) => cats.find((c) => c.slug === slug);
const firstImage = (categoryId: string) => {
  const p = products.find((x) => x.category_id === categoryId && x.product_media.length);
  return p ? [...p.product_media].sort((a, b) => a.position - b.position)[0]!.storage_path : "";
};

// 1. Style from the marketplace preset, content kept from the current theme (hero banners, footer…).
const [draft] = await rest<{ id: string; config: unknown }[]>("GET", `theme_versions?select=id,config&tenant_id=eq.${T}&status=eq.draft`);
const [published] = await rest<{ config: unknown }[]>("GET", `theme_versions?select=config&tenant_id=eq.${T}&status=eq.published`);
const current = resolveThemeConfig(published?.config ?? draft?.config ?? {}).config;
const applied = resolveThemeConfig(applyThemePreset(current, theme.preset)).config as ThemeConfig;

// 2. Store content for every section (each stays editable in the theme editor).
const set = (s: SectionInstance | undefined, patch: Record<string, unknown>) => {
  if (s) s.settings = { ...(s.settings as Record<string, unknown>), ...patch };
};
const byType = (list: SectionInstance[], type: string) => list.filter((s) => s.type === type);

const announce = [
  ...(store?.cod_settings?.enabled !== false ? [{ text: "Cash on Delivery available", href: "" }] : []),
  { text: "Hand block printed in Jaipur", href: "/categories/collections" },
  { text: "New arrivals are here — shop now", href: "/collections/new-arrival-products" },
  ...(store?.whatsapp ? [{ text: `Questions? WhatsApp us on ${store.whatsapp.replace(/^\+91/, "")}`, href: "" }] : []),
];
set(byType(applied.layout.header, "AnnouncementBar")[0], { messages: announce, mode: "rotate", tone: "muted" });

const home = applied.templates.home;
set(byType(home, "Hero")[0], { height: "banner", overlay: 0 });
const [stories, fit] = byType(home, "CategoryGrid");
const storyCats = ["summeride", "women-coord-set", "women-ethnic-top", "women-top", "women-tunic-top"].map(cat).filter((c): c is NonNullable<typeof c> => Boolean(c));
set(stories, { eyebrow: "", heading: "", subheading: "", mode: "manual", shape: "circle", limit: 8, items: storyCats.map((c) => ({ id: c.id, imagePath: firstImage(c.id), label: "" })) });
const [newArr, best, coords] = byType(home, "ProductCarousel");
set(newArr, { eyebrow: "", heading: "New Arrival", subheading: "", source: "collection", collectionId: col("new-arrival-products"), limit: 10, viewAllHref: "/collections/new-arrival-products" });
set(byType(home, "VideoShop")[0], { eyebrow: "", heading: "Watch and Shop", subheading: "", layout: "cards" });
set(best, { eyebrow: "", heading: "Best Seller", subheading: "", source: "collection", collectionId: col("best-selling-products"), limit: 10, viewAllHref: "/collections/best-selling-products" });
set(byType(home, "Marquee")[0], { items: [{ text: store?.name ?? "Ramya Glamorous" }, { text: "रम्या ग्लैमरस" }], size: "large", speed: "slow", tone: "light", separator: "none", link: "" });
const topCats = cats.filter((c) => !c.parent_id);
set(fit, { eyebrow: "", heading: "Find Your Fit", subheading: "", mode: "manual", shape: "portrait", limit: 4, items: topCats.slice(0, 4).map((c) => ({ id: c.id, imagePath: "", label: "" })) });
const coordCat = cat("women-coord-set");
set(coords, { eyebrow: "", heading: "Co-Ord Sets", subheading: "", source: "category", categoryId: coordCat?.id ?? "", limit: 10, viewAllHref: "/categories/women-coord-set" });
// A fourth carousel for the dresses (Summeride), after co-ords.
const summer = cat("summeride");
if (summer && coords) {
  const idx = home.indexOf(coords);
  home.splice(idx + 1, 0, { ...coords, id: "home-summeride-carousel", settings: { ...(coords.settings as Record<string, unknown>), heading: "Summeride", categoryId: summer.id, viewAllHref: "/categories/summeride" } });
}
set(byType(home, "Reviews")[0], { eyebrow: "", heading: "Let customers speak for us", subheading: "" });
const trust = [
  ...(store?.cod_settings?.enabled !== false ? [{ icon: "cod", title: "Cash on Delivery", text: "" }] : []),
  { icon: "handmade", title: "Hand block printed", text: "" },
  { icon: "india", title: "Made in Jaipur", text: "" },
  { icon: "secure", title: "Secure checkout", text: "" },
];
for (const list of [home, applied.templates.collection, applied.templates.product]) for (const s of byType(list, "TrustBadges")) set(s, { items: trust, layout: "marquee", tone: "muted" });
for (const s of byType(applied.templates.collection, "Marquee")) set(s, { items: [{ text: "Hand block printed in Jaipur" }, { text: "Cash on Delivery available" }], size: "small", tone: "dark", separator: "dot", link: "" });
for (const s of byType(applied.templates.product, "Marquee")) set(s, { items: [{ text: "Cash on Delivery available" }, { text: "Hand block printed in Jaipur" }], size: "small", tone: "dark", separator: "dot", link: "" });

// No offer runs on this store, so no "Buy 2 Get 1"-style badge; set one in the theme editor when you do.
applied.productCard = { ...applied.productCard, offerBadge: "" };

// 3. Save as draft (theme_key = jaipur-boutique), then publish.
const strict = parseThemeConfigStrict(applied);
if (!strict.ok) throw new Error(`invalid theme: ${JSON.stringify(strict.issues.slice(0, 5))}`);
if (draft) await rest("PATCH", `theme_versions?id=eq.${draft.id}`, { config: strict.config, theme_key: theme.key, label: theme.name });
else {
  const [latest] = await rest<{ version: number }[]>("GET", `theme_versions?select=version&tenant_id=eq.${T}&order=version.desc&limit=1`);
  await rest("POST", "theme_versions", { tenant_id: T, theme_key: theme.key, version: (latest?.version ?? 0) + 1, status: "draft", label: theme.name, config: strict.config });
}
await http("POST", "/rest/v1/rpc/publish_theme", { token, body: { p_tenant: T, p_label: theme.name } });
console.log(`✓ ${theme.name} applied and published for ${SLUG}`);
console.log("  home:", strict.config.templates.home.map((s) => s.type).join(" → "));
console.log("  collection:", strict.config.templates.collection.map((s) => s.type).join(" → "));
console.log("  product:", strict.config.templates.product.map((s) => s.type).join(" → "));
