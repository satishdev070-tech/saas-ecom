import { storeOrigin } from "@/lib/platform/urls";

/**
 * Storefront URL building (pure). All storefront links are same-origin paths; the proxy maps
 * the tenant host to /store/{host}/..., so links never include the internal prefix.
 */

export const paths = {
  home: () => "/",
  product: (slug: string) => `/products/${encodeURIComponent(slug)}`,
  collection: (slug: string) => `/collections/${encodeURIComponent(slug)}`,
  collections: () => "/collections",
  category: (slug: string) => `/categories/${encodeURIComponent(slug)}`,
  page: (slug: string) => `/pages/${encodeURIComponent(slug)}`,
  blog: () => "/blog",
  blogPost: (slug: string) => `/blog/${encodeURIComponent(slug)}`,
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  cart: () => "/cart",
  account: () => "/account",
  wishlist: () => "/account/wishlist",
  faq: () => "/faq",
  contact: () => "/contact",
  stores: () => "/stores",
} as const;

export type MenuLinkType = "url" | "collection" | "category" | "product" | "page" | "blog" | "home" | "search";

export type MenuItemRow = {
  id: string;
  parent_id: string | null;
  title: string;
  link_type: string;
  link_ref: string | null;
  url: string | null;
  highlight: boolean;
  image_path: string | null;
  position: number;
};

/** id -> slug lookups for the referenced entities (resolved in one batched query per type). */
export type LinkTargets = {
  collections: Map<string, string>;
  categories: Map<string, string>;
  products: Map<string, string>;
  pages: Map<string, string>;
  blogPosts: Map<string, string>;
};

export type MenuNode = {
  id: string;
  title: string;
  href: string | null;
  external: boolean;
  highlight: boolean;
  imagePath: string | null;
  children: MenuNode[];
};

/** Safe href check for menu `url` values (DB already restricts to ^(/|https://)). */
export function safeMenuUrl(url: string | null): { href: string; external: boolean } | null {
  if (!url) return null;
  if (/[\s\\\u0000-\u001f]/.test(url)) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return { href: url, external: false };
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return { href: u.toString(), external: true };
  } catch {
    return null;
  }
}

export function resolveMenuLink(item: Pick<MenuItemRow, "link_type" | "link_ref" | "url">, targets: LinkTargets): { href: string; external: boolean } | null {
  const ref = item.link_ref ?? "";
  const bySlug = (m: Map<string, string>, build: (s: string) => string) => {
    const slug = m.get(ref);
    return slug ? { href: build(slug), external: false } : null;
  };
  switch (item.link_type as MenuLinkType) {
    case "home":
      return { href: "/", external: false };
    case "search":
      return { href: "/search", external: false };
    case "collection":
      return bySlug(targets.collections, paths.collection);
    case "category":
      return bySlug(targets.categories, paths.category);
    case "product":
      return bySlug(targets.products, paths.product);
    case "page":
      return bySlug(targets.pages, paths.page);
    case "blog":
      return item.link_ref ? bySlug(targets.blogPosts, paths.blogPost) : { href: "/blog", external: false };
    case "url":
      return safeMenuUrl(item.url);
    default:
      return null;
  }
}

/** Builds a nested tree (max depth 3) from flat menu_items rows. Unresolvable links keep their title but no href. */
export function buildMenuTree(rows: MenuItemRow[], targets: LinkTargets): MenuNode[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const byParent = new Map<string | null, MenuItemRow[]>();
  for (const r of sorted) {
    const k = r.parent_id ?? null;
    const list = byParent.get(k) ?? [];
    list.push(r);
    byParent.set(k, list);
  }
  const build = (parent: string | null, depth: number): MenuNode[] =>
    depth > 3
      ? []
      : (byParent.get(parent) ?? []).map((r) => {
          const link = resolveMenuLink(r, targets);
          return {
            id: r.id,
            title: r.title,
            href: link?.href ?? null,
            external: link?.external ?? false,
            highlight: r.highlight,
            imagePath: r.image_path,
            children: build(r.id, depth + 1),
          };
        });
  return build(null, 1);
}

/** Ids referenced by menu items, grouped by type, for one batched lookup each. */
export function menuLinkRefs(rows: Pick<MenuItemRow, "link_type" | "link_ref">[]): Record<"collection" | "category" | "product" | "page" | "blog", string[]> {
  const out = { collection: new Set<string>(), category: new Set<string>(), product: new Set<string>(), page: new Set<string>(), blog: new Set<string>() };
  for (const r of rows) {
    if (!r.link_ref) continue;
    if (r.link_type in out) out[r.link_type as keyof typeof out].add(r.link_ref);
  }
  return {
    collection: [...out.collection],
    category: [...out.category],
    product: [...out.product],
    page: [...out.page],
    blog: [...out.blog],
  };
}

/** Absolute canonical URL on the tenant's primary host. */
export function canonicalUrl(primaryHost: string, path: string): string {
  return `${storeOrigin(primaryHost)}${path.startsWith("/") ? path : `/${path}`}`;
}
