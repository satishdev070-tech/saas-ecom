import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { paths } from "@/features/storefront/urls";
import type { SitemapEntry } from "@/features/storefront/seo";

/** Public URLs for a store's sitemap (published data only, via the anon client). */
export async function getSitemapEntries(tenantId: string): Promise<SitemapEntry[]> {
  const db = createSupabasePublicClient();
  const [products, collections, categories, pages, posts] = await Promise.all([
    db.from("products").select("slug, updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(5000),
    db.from("collections").select("slug, updated_at").eq("tenant_id", tenantId).limit(1000),
    db.from("categories").select("slug, updated_at").eq("tenant_id", tenantId).limit(1000),
    db.from("pages").select("slug, updated_at").eq("tenant_id", tenantId).limit(500),
    db.from("blog_posts").select("slug, updated_at").eq("tenant_id", tenantId).limit(2000),
  ]);
  return [
    { path: "/" },
    ...(collections.data ?? []).map((r) => ({ path: paths.collection(r.slug), lastModified: r.updated_at })),
    ...(categories.data ?? []).map((r) => ({ path: paths.category(r.slug), lastModified: r.updated_at })),
    ...(products.data ?? []).map((r) => ({ path: paths.product(r.slug), lastModified: r.updated_at })),
    ...(pages.data ?? []).map((r) => ({ path: paths.page(r.slug), lastModified: r.updated_at })),
    ...(posts.data?.length ? [{ path: paths.blog() }] : []),
    ...(posts.data ?? []).map((r) => ({ path: paths.blogPost(r.slug), lastModified: r.updated_at })),
  ];
}
