import "server-only";
import { cache } from "react";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/observability/logger";
import { parseStoredBlocks, type ContentBlock } from "@/features/content/blocks";
import { readSeo, type SeoFields } from "../seo";
import { buildMenuTree, menuLinkRefs, type LinkTargets, type MenuItemRow, type MenuNode } from "../urls";
import { readAddress, type StoreAddress } from "../store-profile";

/** Public content reads (menus, pages, blog, FAQs, locations, reviews). Tenant id from the verified host only. */

const pub = () => createSupabasePublicClient();

async function slugMap(table: "collections" | "categories" | "products" | "pages" | "blog_posts", tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await pub().from(table).select("id, slug").eq("tenant_id", tenantId).in("id", ids.slice(0, 200));
  if (error) logger.warn("storefront.menu_targets_failed", { table, error: error.message });
  for (const r of (data ?? []) as { id: string; slug: string }[]) out.set(r.id, r.slug);
  return out;
}

/**
 * Menus by handle, with link targets resolved in one batched query per entity type.
 * Items pointing at hidden/unpublished entities keep their title but get no link.
 */
export const getMenus = cache(async (tenantId: string, handlesKey: string): Promise<Record<string, { title: string; items: MenuNode[] }>> => {
  const handles = handlesKey.split(",").filter((h) => /^[a-z0-9-]{2,40}$/.test(h)).slice(0, 8);
  if (handles.length === 0) return {};
  const { data: menus, error } = await pub().from("menus").select("id, handle, title").eq("tenant_id", tenantId).in("handle", handles);
  if (error) logger.warn("storefront.menus_failed", { tenantId, error: error.message });
  if (!menus?.length) return {};
  const { data: items, error: itemsError } = await pub()
    .from("menu_items")
    .select("id, menu_id, parent_id, title, link_type, link_ref, url, highlight, image_path, position")
    .eq("tenant_id", tenantId)
    .in(
      "menu_id",
      menus.map((m) => m.id),
    )
    .order("position")
    .limit(600);
  if (itemsError) logger.warn("storefront.menu_items_failed", { tenantId, error: itemsError.message });
  const rows = items ?? [];
  const refs = menuLinkRefs(rows);
  const [collections, categories, products, pages, blogPosts] = await Promise.all([
    slugMap("collections", tenantId, refs.collection),
    slugMap("categories", tenantId, refs.category),
    slugMap("products", tenantId, refs.product),
    slugMap("pages", tenantId, refs.page),
    slugMap("blog_posts", tenantId, refs.blog),
  ]);
  const targets: LinkTargets = { collections, categories, products, pages, blogPosts };
  const out: Record<string, { title: string; items: MenuNode[] }> = {};
  for (const m of menus) {
    out[m.handle] = { title: m.title, items: buildMenuTree(rows.filter((r) => r.menu_id === m.id) as MenuItemRow[], targets) };
  }
  return out;
});

export type PageContent = { id: string; title: string; slug: string; kind: string; blocks: ContentBlock[]; seo: SeoFields; updatedAt: string };

export const getPageBySlug = cache(async (tenantId: string, slug: string): Promise<PageContent | null> => {
  const { data, error } = await pub().from("pages").select("id, title, slug, kind, body, seo, updated_at").eq("tenant_id", tenantId).eq("slug", slug).maybeSingle();
  if (error) logger.error("storefront.page_failed", { tenantId, error: error.message });
  return data ? { id: data.id, title: data.title, slug: data.slug, kind: data.kind, blocks: parseStoredBlocks(data.body), seo: readSeo(data.seo), updatedAt: data.updated_at } : null;
});

export async function getPageById(tenantId: string, id: string): Promise<PageContent | null> {
  const { data } = await pub().from("pages").select("id, title, slug, kind, body, seo, updated_at").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data ? { id: data.id, title: data.title, slug: data.slug, kind: data.kind, blocks: parseStoredBlocks(data.body), seo: readSeo(data.seo), updatedAt: data.updated_at } : null;
}

export const getPagesByKind = cache(async (tenantId: string, kind: "policy" | "contact" | "faq" | "about" | "page"): Promise<{ title: string; slug: string }[]> => {
  const { data, error } = await pub().from("pages").select("title, slug").eq("tenant_id", tenantId).eq("kind", kind).order("title").limit(20);
  if (error) logger.warn("storefront.pages_failed", { tenantId, error: error.message });
  return data ?? [];
});

export type BlogPostSummary = { id: string; title: string; slug: string; excerpt: string | null; coverPath: string | null; authorName: string | null; tags: string[]; publishedAt: string | null; updatedAt: string };
const POST_SUMMARY = "id, title, slug, excerpt, cover_path, author_name, tags, published_at, updated_at";
type PostRow = { id: string; title: string; slug: string; excerpt: string | null; cover_path: string | null; author_name: string | null; tags: string[]; published_at: string | null; updated_at: string };
const toPost = (p: PostRow): BlogPostSummary => ({
  id: p.id,
  title: p.title,
  slug: p.slug,
  excerpt: p.excerpt,
  coverPath: p.cover_path,
  authorName: p.author_name,
  tags: p.tags,
  publishedAt: p.published_at,
  updatedAt: p.updated_at,
});

export async function listBlogPosts(tenantId: string, page: number, pageSize = 12): Promise<{ posts: BlogPostSummary[]; total: number }> {
  const from = (page - 1) * pageSize;
  const { data, count, error } = await pub()
    .from("blog_posts")
    .select(POST_SUMMARY, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("published_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) logger.error("storefront.blog_failed", { tenantId, error: error.message });
  return { posts: (data ?? []).map(toPost), total: count ?? 0 };
}

export const getBlogPostBySlug = cache(async (tenantId: string, slug: string): Promise<(BlogPostSummary & { blocks: ContentBlock[]; seo: SeoFields }) | null> => {
  const { data, error } = await pub().from("blog_posts").select(`${POST_SUMMARY}, body, seo`).eq("tenant_id", tenantId).eq("slug", slug).maybeSingle();
  if (error) logger.error("storefront.blog_post_failed", { tenantId, error: error.message });
  return data ? { ...toPost(data), blocks: parseStoredBlocks(data.body), seo: readSeo(data.seo) } : null;
});

export async function getBlogPostById(tenantId: string, id: string): Promise<BlogPostSummary | null> {
  const { data } = await pub().from("blog_posts").select(POST_SUMMARY).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data ? toPost(data) : null;
}

export type Faq = { id: string; question: string; answer: string; group: string };

export async function getFaqs(tenantId: string, opts: { group?: string; limit?: number } = {}): Promise<Faq[]> {
  let q = pub().from("faqs").select("id, question, answer, group_name").eq("tenant_id", tenantId);
  if (opts.group) q = q.eq("group_name", opts.group);
  const { data, error } = await q.order("position").limit(Math.min(opts.limit ?? 50, 100));
  if (error) logger.warn("storefront.faqs_failed", { tenantId, error: error.message });
  return (data ?? []).map((f) => ({ id: f.id, question: f.question, answer: f.answer, group: f.group_name }));
}

export type StoreLocation = { id: string; name: string; address: StoreAddress; phone: string | null; hours: string | null; latitude: number | null; longitude: number | null };

export async function getStoreLocations(tenantId: string): Promise<StoreLocation[]> {
  const { data, error } = await pub().from("store_locations").select("id, name, address, phone, hours, latitude, longitude").eq("tenant_id", tenantId).order("position").limit(100);
  if (error) logger.warn("storefront.locations_failed", { tenantId, error: error.message });
  return (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    address: readAddress(l.address),
    phone: l.phone,
    hours: l.hours,
    latitude: l.latitude === null ? null : Number(l.latitude),
    longitude: l.longitude === null ? null : Number(l.longitude),
  }));
}

export type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  verified: boolean;
  /** Placeholder review (source = sample): always labelled on the storefront. */
  sample: boolean;
  createdAt: string;
  product?: { slug: string; title: string; imagePath: string | null };
};

type ReviewRow = { id: string; rating: number; title: string | null; body: string | null; author_name: string; verified_purchase: boolean; created_at: string; source?: string };
const toReview = (r: ReviewRow): Review => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, authorName: r.author_name, verified: r.verified_purchase, sample: r.source === "sample", createdAt: r.created_at });
const REVIEW_COLS = "id, rating, title, body, author_name, verified_purchase, created_at";

/** Runs a review query with the `source` column, retrying without it if migration 1700 isn't applied yet. */
async function withSource<T>(run: (cols: string) => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
  const first = await run(`${REVIEW_COLS}, source`);
  if (!first.error) return first.data;
  if (!/source/.test(first.error.message)) {
    logger.warn("storefront.reviews_failed", { error: first.error.message });
    return null;
  }
  const retry = await run(REVIEW_COLS);
  if (retry.error) logger.warn("storefront.reviews_failed", { error: retry.error.message });
  return retry.data;
}

export async function getProductReviews(tenantId: string, productId: string, limit = 10): Promise<{ reviews: Review[]; distribution: number[] }> {
  const [list, ratings] = await Promise.all([
    withSource<ReviewRow[]>((cols) => pub().from("reviews").select(cols).eq("tenant_id", tenantId).eq("product_id", productId).order("created_at", { ascending: false }).limit(limit).returns<ReviewRow[]>()),
    pub().from("reviews").select("rating").eq("tenant_id", tenantId).eq("product_id", productId).limit(2000),
  ]);
  const distribution = [0, 0, 0, 0, 0];
  for (const r of ratings.data ?? []) if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]! += 1;
  return { reviews: (list ?? []).map(toReview), distribution };
}

/** Store-wide rating summary for the reviews section header (approved reviews only, via RLS). */
export async function getReviewSummary(tenantId: string): Promise<{ average: number; count: number }> {
  const { data } = await pub().from("reviews").select("rating").eq("tenant_id", tenantId).limit(5000);
  const list = data ?? [];
  return { count: list.length, average: list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0 };
}

export async function getLatestReviews(tenantId: string, minRating: number, limit: number): Promise<Review[]> {
  type Row = ReviewRow & { products: { slug: string; title: string; product_media: { storage_path: string; position: number; media_type: string }[] } | { slug: string; title: string; product_media: { storage_path: string; position: number; media_type: string }[] }[] | null };
  const data = await withSource<Row[]>((cols) =>
    pub()
      .from("reviews")
      .select(`${cols}, products(slug, title, product_media(storage_path, position, media_type))`)
      .eq("tenant_id", tenantId)
      .gte("rating", minRating)
      .not("body", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<Row[]>(),
  );
  return (data ?? []).map((r) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    const img = p ? [...p.product_media].filter((m) => m.media_type === "image").sort((a, b) => a.position - b.position)[0] : undefined;
    return { ...toReview(r), product: p ? { slug: p.slug, title: p.title, imagePath: img?.storage_path ?? null } : undefined };
  });
}
