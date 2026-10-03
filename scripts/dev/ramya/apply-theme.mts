/**
 * Builds and publishes the "Sutra Atelier" theme for Ramya By Ayushi Paliya ONLY, using that
 * store's own products, collections and categories (hero and tile images come from its product
 * photos). Waits for the store and its products to exist (the clone script creates them).
 * Writes a draft theme_version for that tenant, then publishes it with the owner's session.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/ramya/apply-theme.mts [slug]
 */
import { DEFAULT_THEME_CONFIG } from "../../../src/features/theme/default-theme";
import { parseThemeConfigStrict, resolveThemeConfig } from "../../../src/features/theme/schema/config";
import { defaultSettings } from "../../../src/features/theme/sections/definitions";
import type { SectionInstance, SectionType } from "../../../src/features/theme/sections/types";
import { applyThemePreset } from "../../../src/features/theme/marketplace/apply";
import { findMarketplaceTheme } from "../../../src/features/theme/marketplace/catalog";

const ALLOWED_SLUG = "ramya-by-ayushi-paliya";
/** The Paliya (real live store): never touched by this script. */
const FORBIDDEN_TENANT = "71458ab4-6b05-4798-bc95-acfe1fd15420";
const THEME_KEY = "sutra-atelier";

const slug = process.argv[2] ?? ALLOWED_SLUG;
if (slug !== ALLOWED_SLUG) throw new Error(`Refusing: this script only themes "${ALLOWED_SLUG}" (got "${slug}").`);

const env = (n: string) => {
  const v = process.env[n] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1)] ?? "") : v;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUB = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!URL_ || !SECRET || !PUB) throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");

async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, { method, headers: { apikey: opts.token ? PUB : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${t.slice(0, 300)}`);
  return (t ? JSON.parse(t) : null) as T;
}
const rest = <T = unknown,>(m: string, p: string, b?: unknown) => http<T>(m, `/rest/v1/${p}`, { body: b });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Wait for the store, then for its products (count stable across two polls).
// ---------------------------------------------------------------------------
let T = "";
for (let i = 0; ; i++) {
  const [t] = await rest<{ id: string; slug: string }[]>("GET", `tenants?select=id,slug&slug=eq.${ALLOWED_SLUG}`);
  if (t) {
    T = t.id;
    break;
  }
  if (i % 6 === 0) console.log("… waiting for the store to exist");
  await sleep(10_000);
}
if (T === FORBIDDEN_TENANT || T.startsWith("71458ab4")) throw new Error("Refusing: resolved to The Paliya's tenant id.");

type Product = { id: string; title: string; slug: string; category_id: string | null; created_at: string; product_media: { storage_path: string; position: number; media_type: string; width: number | null; height: number | null }[] };
let products: Product[] = [];
let last = -1;
for (let i = 0; ; i++) {
  products = await rest<Product[]>("GET", `products?select=id,title,slug,category_id,created_at,product_media(storage_path,position,media_type,width,height)&tenant_id=eq.${T}&status=eq.active&order=created_at.desc&limit=200`);
  if (products.length > 0 && products.length === last) break;
  if (i % 6 === 0) console.log(`… waiting for products (${products.length})`);
  last = products.length;
  await sleep(products.length ? 15_000 : 10_000);
}
console.log(`store ${T}: ${products.length} active products`);

const own = (p: string) => p.startsWith(`tenant/${T}/`);
const imagesOf = (p: Product) => p.product_media.filter((m) => m.media_type === "image" && own(m.storage_path)).sort((a, b) => a.position - b.position);
const withImg = products.filter((p) => imagesOf(p).length);
if (!withImg.length) throw new Error("No product photos yet");
const img = (p: Product, n = 0) => imagesOf(p)[Math.min(n, imagesOf(p).length - 1)]!.storage_path;
const at = (i: number) => withImg[i % withImg.length]!;
/** Rotating picks so neighbouring sections don't repeat the same products. */
const pick = (from: number, n: number) => Array.from({ length: Math.min(n, withImg.length) }, (_, k) => at(from + k));
/** A portrait-ish photo that works as a full-bleed image (largest first). */
const big = [...withImg].sort((a, b) => (imagesOf(b)[0]!.width ?? 0) * (imagesOf(b)[0]!.height ?? 0) - (imagesOf(a)[0]!.width ?? 0) * (imagesOf(a)[0]!.height ?? 0));

const collections = await rest<{ id: string; title: string; slug: string }[]>("GET", `collections?select=id,title,slug&tenant_id=eq.${T}&order=position.asc`).catch(() => rest<{ id: string; title: string; slug: string }[]>("GET", `collections?select=id,title,slug&tenant_id=eq.${T}`));
const categories = await rest<{ id: string; name: string; slug: string; parent_id: string | null; image_path: string | null }[]>("GET", `categories?select=id,name,slug,parent_id,image_path&tenant_id=eq.${T}`);
const store = (await rest<{ name: string; social: Record<string, string> | null }[]>("GET", `stores?select=name,social&tenant_id=eq.${T}`))[0];
const coll = (re: RegExp) => collections.find((c) => re.test(c.slug) || re.test(c.title));
const newColl = coll(/new/i);
const bestColl = coll(/best/i);
const firstHref = (c?: { slug: string }) => (c ? `/collections/${c.slug}` : "/search");
const shopHref = firstHref(newColl ?? coll(/wom/i) ?? collections[0]);

// Categories that have products (by product count), each with a photo from one of its products.
const countByCat = new Map<string, Product[]>();
for (const p of withImg) if (p.category_id) countByCat.set(p.category_id, [...(countByCat.get(p.category_id) ?? []), p]);
const catTiles = [
  ...categories.filter((c) => countByCat.has(c.id)).sort((a, b) => countByCat.get(b.id)!.length - countByCat.get(a.id)!.length),
  ...categories.filter((c) => !countByCat.has(c.id) && c.image_path && own(c.image_path)),
]
  .slice(0, 6)
  .map((c, i) => ({ id: c.id, imagePath: countByCat.has(c.id) ? img(countByCat.get(c.id)![0]!, 0) : (c.image_path ?? img(at(i))), label: "", subtitle: "" }));

// ---------------------------------------------------------------------------
// 2. Theme: preset style (tokens, header, cards, chrome) + this store's content.
// ---------------------------------------------------------------------------
const theme = findMarketplaceTheme(THEME_KEY);
if (!theme) throw new Error(`Theme preset ${THEME_KEY} not found`);
const base = resolveThemeConfig(applyThemePreset(structuredClone(DEFAULT_THEME_CONFIG), theme.preset)).config;

// Ramya's own palette: indigo blue (instead of the preset's maroon) with gold and cream.
base.tokens = {
  ...base.tokens,
  colors: { primary: "#0a3f79", secondary: "#072b55", accent: "#b08d3e", background: "#fffcf5", text: "#1e2330", border: "#e8dfcc", sale: "#a8322d" },
  spacing: "comfortable",
  finish: "refined",
};
base.header = { ...base.header, wordmark: "Ramya", logoTagline: "By Ayushi Paliya", bottomNav: true, showSearch: true, showCart: true };

const sec = (id: string, type: SectionType, settings: Record<string, unknown>, visibility = { desktop: true, mobile: true }): SectionInstance => ({ id, type, settings: { ...defaultSettings(type), ...settings }, visibility });
const styleOf = (list: typeof theme.preset.home, i: number) => list[i]![1];

const heroSlides = [big[0]!, big[1] ?? big[0]!, big[2] ?? big[0]!].map((p, i) => ({
  imagePath: img(p, 0),
  mobileImagePath: "",
  alt: p.title,
  eyebrow: ["The festive chapter · 2026", "Hand block printed", "Made for your moments"][i]!,
  heading: ["More than", "Prints that", "Cotton, but"][i]!,
  headingAccent: ["an outfit.", "tell stories.", "make it festive."][i]!,
  subheading: "For the moments that become memories.",
  ctaLabel: "Explore the collection",
  ctaHref: firstHref(newColl ?? collections[0]),
  align: "left",
  textTone: "light",
}));
const trustItems = [
  { icon: "sparkle", title: "Considered collections", text: "" },
  { icon: "sparkle", title: "Timeless Indian style", text: "" },
  { icon: "sparkle", title: "Details worth keeping", text: "" },
];
const marqueeItems = [{ text: "Woven with love" }, { text: "Worn with feeling" }, { text: "Rooted in India" }, { text: "Made for your moments" }];
const productSource = (ps: Product[]) => ({ source: "products", productIds: ps.map((p) => p.id), limit: Math.max(2, ps.length) });
const collSource = (c: { id: string } | undefined, limit: number) => (c ? { source: "collection", collectionId: c.id, limit } : { source: "newest", limit });
const H = theme.preset.home;

const home: SectionInstance[] = [
  sec("home-hero", "Hero", { ...styleOf(H, 0), slides: heroSlides, footnote: "Heritage, in every thread", scrollLabel: "Scroll to discover" }),
  sec("home-marquee", "Marquee", { ...styleOf(H, 1), items: marqueeItems }),
  sec("home-moods", "CategoryGrid", { ...styleOf(H, 2), heading: "Cotton moods.", headingNote: "Follow your mood. Find your weave.", mode: "manual", items: catTiles, limit: Math.max(2, catTiles.length) }),
  sec("home-decor-margins-1", "DecorDivider", { layout: "margins" }),
  sec("home-woven", "ProductCarousel", { ...styleOf(H, 3), heading: "Woven to be", headingAccent: "remembered.", autoScroll: true, ...productSource(pick(0, 10)) }),
  sec("home-new", "ProductGrid", { ...styleOf(H, 4), eyebrow: "Fresh from the atelier", heading: "New arrivals", viewAllHref: firstHref(newColl), ...collSource(newColl, 6) }),
  sec("home-favourites", "ProductGrid", { ...styleOf(H, 5), eyebrow: "Loved, time and again", heading: "The favourites", viewAllHref: firstHref(bestColl), ...(bestColl ? collSource(bestColl, 6) : productSource(pick(3, 6))) }),
  sec("home-decor-krishna", "DecorDivider", { motif: "krishna" }),
  sec("home-band", "FeatureBand", { ...styleOf(H, 6), heading: `The ${store?.name.split(" ")[0] ?? "Atelier"} Collection`, imagePath: img(big[3] ?? big[0]!, 1), alt: "", featureEyebrow: "For your most beautiful beginnings", featureHeading: "A love story,", featureAccent: "printed in cotton.", featureHref: shopHref, ctaLabel: "Explore the edit", ctaHref: shopHref, ...productSource(pick(4, 4)) }),
  sec("home-joy", "CompactProducts", { ...styleOf(H, 7), heading: "Threads of", headingAccent: "joy.", ...productSource(pick(0, 4)) }),
  sec("home-treasures", "CompactProducts", { ...styleOf(H, 8), heading: "Timeless", headingAccent: "treasures.", ...productSource(pick(4, 4)) }),
  sec("home-decor-art", "DecorDivider", { motif: "krishna", artwork: "met-grove", heading: "Printed with devotion", text: "Like the Rajasthani miniatures where Radha and Krishna wander through flowering groves, every block we carve carries a little of that quiet joy." }),
  sec("home-whispers", "Lookbook", { ...styleOf(H, 9), eyebrow: "The signature edit", heading: "Summer", headingAccent: "Whispers.", subheading: "Light-hearted colours. Unforgettable drapes.", looks: pick(2, 3).map((p) => ({ imagePath: img(p, 0), alt: p.title, caption: "", productId: p.id })) }),
  sec("home-decor-margins-2", "DecorDivider", { layout: "margins" }),
  sec("home-muse", "ProductSpotlight", { ...styleOf(H, 10), heading: "Choose your muse", headingNote: "One drape. A thousand possibilities.", tagline: "The art of being you.", note: "Hand block printed, pure cotton", ...productSource(pick(5, 3)) }),
  sec("home-edits", "CollectionGrid", { ...styleOf(H, 11), eyebrow: "Life is an occasion", heading: "Edits for", headingAccent: "every moment.", mode: "manual", columns: Math.min(4, Math.max(2, collections.length)), limit: Math.max(2, Math.min(4, collections.length)), items: collections.slice(0, 4).map((c, i) => ({ id: c.id, imagePath: img(at(6 + i), 0), label: "", subtitle: ["For every beautiful beginning", "Dress like a celebration", "Make the ordinary special", "For nights to remember"][i]! })) }),
  sec("home-decor-lotus", "DecorDivider", { motif: "lotus" }),
  sec("home-emotions", "SocialProof", { ...styleOf(H, 12), heading: "Watch your emotions", headingNote: "Every colour tells a story", handle: "", profileUrl: store?.social?.instagram ?? "", posts: pick(1, 7).map((p) => ({ imagePath: img(p, 1), videoUrl: "", alt: p.title, href: "" })) }),
  sec("home-chapter", "EditorialImageText", { ...styleOf(H, 13), imagePath: img(big[1] ?? big[0]!, 2), alt: "", eyebrow: "Our thread, your story", heading: "The festive", headingAccent: "chapter.", subheading: "Heirloom details. Unforgettable moments.", ctaLabel: "Explore this edit", ctaHref: shopHref, thumbs: pick(0, 7).map((p) => ({ imagePath: img(p, 0), alt: p.title, href: `/products/${p.slug}` })) }),
  sec("home-journal", "EditorialImageText", { ...styleOf(H, 14), imagePath: img(at(7), 0), alt: "", eyebrow: `The ${store?.name.split(" ")[0] ?? "atelier"} journal`, heading: "Latest threads", subheading: "Old-world charm.\nA new way to wear it.", ctaLabel: "Shop the modern edit", ctaHref: shopHref, noteEyebrow: "01 / Style notes", noteHeading: "A little colour.\nA lot of character.", body: "Let your outfit do the talking. Discover colours that turn an ordinary day into your favourite occasion." }),
  sec("home-decor-feather", "DecorDivider", { motif: "peacock" }),
  sec("home-trust", "TrustBadges", { ...styleOf(H, 15), items: trustItems }),
];

const C = theme.preset.collection!;
const collection: SectionInstance[] = [
  sec("collection-marquee", "Marquee", { ...C[0]![1], items: marqueeItems }),
  sec("collection-content", "PageContent", {}),
  sec("collection-joy", "CompactProducts", { ...C[2]![1], heading: "You may also", headingAccent: "love.", ...productSource(pick(2, 4)) }),
  sec("collection-trust", "TrustBadges", { ...C[3]![1], items: trustItems }),
];
const Pd = theme.preset.product!;
const product: SectionInstance[] = [
  sec("product-content", "PageContent", {}),
  sec("product-muse", "ProductSpotlight", { ...Pd[1]![1], heading: "Complete the", headingAccent: "look.", headingStyle: "default", headingNote: "One drape. A thousand possibilities.", tagline: "The art of being you.", note: "Hand block printed, pure cotton", ...productSource(pick(5, 3)) }),
  sec("product-woven", "ProductCarousel", { ...Pd[2]![1], heading: "Woven to be", headingAccent: "remembered.", autoScroll: true, ...productSource(pick(0, 10)) }),
  sec("product-trust", "TrustBadges", { ...Pd[3]![1], items: trustItems }),
];

// Chrome content.
for (const s of base.layout.header) {
  if (s.type === "Header") s.settings = { ...s.settings, layout: "logo-left-nav-center", showInlineMenu: true, menuStyle: "bar" };
  if (s.type === "AnnouncementBar") s.settings = { ...s.settings, messages: [{ text: "A little tradition. A little you.", href: "" }, { text: "Discover the festive edit", href: firstHref(newColl ?? collections[0]) }] };
}
for (const s of base.layout.footer) {
  if (s.type === "Footer") s.settings = { ...s.settings, tone: "muted", decor: "krishna", about: "Rooted in tradition. Woven for today.", menuHandles: ["shop", "footer"], copyright: `© 2026 ${store?.name ?? ""}`.trim(), showNewsletter: false };
}

const cfg = { ...base, templates: { home, collection, product } };
const strict = parseThemeConfigStrict(cfg);
if (!strict.ok) throw new Error(JSON.stringify(strict.issues.slice(0, 5)));
const json = JSON.stringify(strict.config);
const foreign = json.match(/tenant\/([0-9a-f-]{36})\//g)?.filter((m) => !m.includes(T));
if (foreign?.length) throw new Error(`Refusing: config references another tenant's files (${foreign[0]})`);

// ---------------------------------------------------------------------------
// 3. Draft (secret key, scoped by tenant id) + publish (owner session).
// ---------------------------------------------------------------------------
async function ownerToken(tenantId: string) {
  const [m] = await rest<{ user_id: string }[]>("GET", `tenant_memberships?select=user_id&tenant_id=eq.${tenantId}&role=eq.owner&limit=1`);
  if (!m) throw new Error("No owner membership");
  const u = await http<{ email: string }>("GET", `/auth/v1/admin/users/${m.user_id}`);
  const l = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email: u.email } });
  const r = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: l.properties?.hashed_token ?? l.hashed_token }) });
  return ((await r.json()) as { access_token: string }).access_token;
}

const LABEL = "Sutra Atelier";
const [draft] = await rest<{ id: string; tenant_id: string }[]>("GET", `theme_versions?select=id,tenant_id&tenant_id=eq.${T}&status=eq.draft`);
if (draft) {
  if (draft.tenant_id !== T) throw new Error("tenant mismatch");
  await rest("PATCH", `theme_versions?id=eq.${draft.id}&tenant_id=eq.${T}`, { config: strict.config, label: LABEL, theme_key: THEME_KEY });
} else {
  const [latest] = await rest<{ version: number }[]>("GET", `theme_versions?select=version&tenant_id=eq.${T}&order=version.desc&limit=1`);
  await rest("POST", "theme_versions", { tenant_id: T, theme_key: THEME_KEY, version: (latest?.version ?? 0) + 1, status: "draft", label: LABEL, config: strict.config });
}
await http("POST", "/rest/v1/rpc/publish_theme", { token: await ownerToken(T), body: { p_tenant: T, p_label: LABEL } });
console.log("✓ published Sutra Atelier for", ALLOWED_SLUG, "\n  home:", strict.config.templates.home.map((s) => s.type).join(" → "));
