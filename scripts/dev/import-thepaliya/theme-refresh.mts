/**
 * Refresh the-paliya's published theme (keeps every existing edit): premium fonts and colours,
 * ethnic footer with newsletter, Instagram posts/reels section, reviews heading. Publishes;
 * the previous version stays in history for rollback.
 *
 *   pnpm exec tsx --env-file=.env --env-file-if-exists=.env.local scripts/dev/import-thepaliya/theme-refresh.mts
 */
import { parseThemeConfigStrict, resolveThemeConfig } from "../../../src/features/theme/schema/config";
import { defaultSettings } from "../../../src/features/theme/sections/definitions";
import type { SectionInstance } from "../../../src/features/theme/sections/types";

const env = (n: string) => {
  const v = process.env[n] ?? "";
  return v.startsWith("$") ? (process.env[v.slice(1)] ?? "") : v;
};
const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SECRET = env("SUPABASE_SECRET_KEY");
const PUB = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
async function http<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${URL_}${path}`, { method, headers: { apikey: opts.token ? PUB : SECRET, Authorization: `Bearer ${opts.token ?? SECRET}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${t.slice(0, 300)}`);
  return (t ? JSON.parse(t) : null) as T;
}
const rest = <T = unknown,>(m: string, p: string, b?: unknown) => http<T>(m, `/rest/v1/${p}`, { body: b });
async function ownerToken(T: string) {
  const [m] = await rest<{ user_id: string }[]>("GET", `tenant_memberships?select=user_id&tenant_id=eq.${T}&role=eq.owner&limit=1`);
  const u = await http<{ email: string }>("GET", `/auth/v1/admin/users/${m!.user_id}`);
  const l = await http<{ properties?: { hashed_token?: string }; hashed_token?: string }>("POST", "/auth/v1/admin/generate_link", { body: { type: "magiclink", email: u.email } });
  const r = await fetch(`${URL_}/auth/v1/verify`, { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: l.properties?.hashed_token ?? l.hashed_token }) });
  return ((await r.json()) as { access_token: string }).access_token;
}

const [tenant] = await rest<{ id: string }[]>("GET", "tenants?select=id&slug=eq.the-paliya");
const T = tenant!.id;
const [store] = await rest<{ name: string; social: Record<string, string> }[]>("GET", `stores?select=name,social&tenant_id=eq.${T}`);
const [pub] = await rest<{ config: unknown }[]>("GET", `theme_versions?select=config&tenant_id=eq.${T}&status=eq.published`);
const cfg = resolveThemeConfig(pub!.config).config;

// 1. Premium, fresh typography + ethnic palette (maroon & antique gold).
cfg.tokens = { ...cfg.tokens, headingFont: "didone", bodyFont: "geometric-sans", headingCase: "normal", sectionHeadingAlign: "center", colors: { ...cfg.tokens.colors, primary: "#5b1a2b", accent: "#c29a4a", secondary: "#2f4f3e" } };
cfg.productCard = { ...cfg.productCard, showBrand: false, showQuickAdd: true, showWishlist: true, showRating: true, showSizes: true, badgeStyle: "pill" };

// 2. Ethnic footer with newsletter.
for (const f of cfg.layout.footer.filter((s) => s.type === "Footer")) {
  f.settings = { ...(f.settings as Record<string, unknown>), tone: "dark", decor: "ethnic", showNewsletter: true, newsletterHeading: `Join the ${store!.name} family`, newsletterText: "New arrivals, festive edits and early access to offers — straight to your inbox." };
}

// 3. Reviews heading, and an Instagram section (posts from the store's own product photos).
const home = cfg.templates.home;
for (const r of home.filter((s) => s.type === "Reviews")) r.settings = { ...(r.settings as Record<string, unknown>), eyebrow: "Loved by our customers", heading: "What our customers say", subheading: "", limit: 12 };
const products = await rest<{ product_media: { storage_path: string; position: number; media_type: string }[]; title: string }[]>("GET", `products?select=title,product_media(storage_path,position,media_type)&tenant_id=eq.${T}&status=eq.active&order=created_at.desc&limit=12`);
const photos = products.flatMap((p) => {
  const m = p.product_media.filter((x) => x.media_type === "image").sort((a, b) => a.position - b.position)[0];
  return m ? [{ imagePath: m.storage_path, videoUrl: "", alt: p.title, href: "" }] : [];
});
const igUrl = store!.social?.instagram ?? "";
const handle = igUrl.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1] ?? "";
const existing = home.find((s) => s.type === "SocialProof");
const ig: SectionInstance = existing ?? { id: "home-instagram", type: "SocialProof", settings: defaultSettings("SocialProof"), visibility: { desktop: true, mobile: true } };
ig.settings = { ...(ig.settings as Record<string, unknown>), eyebrow: "Follow along", heading: "Seen on Instagram", subheading: "Tag us to be featured.", handle: handle ? `@${handle}` : "", profileUrl: igUrl, layout: "mosaic", showProfile: true, posts: ((ig.settings as { posts?: unknown[] }).posts?.length ? (ig.settings as { posts: unknown[] }).posts : photos.slice(0, 7)) };
if (!existing) {
  const trust = home.findIndex((s) => s.type === "TrustBadges");
  home.splice(trust < 0 ? home.length : trust, 0, ig);
}

const strict = parseThemeConfigStrict(cfg);
if (!strict.ok) throw new Error(JSON.stringify(strict.issues.slice(0, 5)));
const [draft] = await rest<{ id: string }[]>("GET", `theme_versions?select=id&tenant_id=eq.${T}&status=eq.draft`);
if (draft) await rest("PATCH", `theme_versions?id=eq.${draft.id}`, { config: strict.config, label: "Premium refresh" });
else {
  const [latest] = await rest<{ version: number }[]>("GET", `theme_versions?select=version&tenant_id=eq.${T}&order=version.desc&limit=1`);
  await rest("POST", "theme_versions", { tenant_id: T, theme_key: "jaipur-boutique", version: (latest?.version ?? 0) + 1, status: "draft", label: "Premium refresh", config: strict.config });
}
await http("POST", "/rest/v1/rpc/publish_theme", { token: await ownerToken(T), body: { p_tenant: T, p_label: "Premium refresh" } });
console.log("✓ published. Home:", strict.config.templates.home.map((s) => s.type).join(" → "));
