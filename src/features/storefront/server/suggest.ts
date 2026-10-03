import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { logger } from "@/lib/observability/logger";
import { listProducts } from "./catalog";

export type SearchSuggestions = {
  query: string;
  total: number;
  products: { slug: string; title: string; imagePath: string | null; priceMinor: number; compareAtMinor: number | null; inStock: boolean }[];
  categories: { slug: string; name: string }[];
  collections: { slug: string; title: string }[];
};

/** PostgREST `ilike` pattern with wildcards/escapes in user input neutralised. */
export function ilikePattern(q: string): string {
  return `%${q.replace(/[\\%_,()*]/g, " ").trim()}%`;
}

/**
 * Autocomplete for the storefront search overlay. Tenant comes from the verified host (caller);
 * anonymous client, so RLS only exposes published products and open tenants.
 */
export async function getSearchSuggestions(tenantId: string, query: string): Promise<SearchSuggestions> {
  const q = query.trim().slice(0, 60);
  const pattern = ilikePattern(q);
  const db = createSupabasePublicClient();
  const [products, categories, collections] = await Promise.all([
    listProducts(tenantId, { p_query: q, p_sort: "relevance", p_limit: 6, p_offset: 0 }),
    db.from("categories").select("slug, name").eq("tenant_id", tenantId).ilike("name", pattern).order("position").limit(4),
    db.from("collections").select("slug, title").eq("tenant_id", tenantId).ilike("title", pattern).order("position").limit(4),
  ]);
  if (categories.error) logger.warn("storefront.suggest_categories_failed", { tenantId, error: categories.error.message });
  if (collections.error) logger.warn("storefront.suggest_collections_failed", { tenantId, error: collections.error.message });
  return {
    query: q,
    total: products.total,
    products: products.cards.map((c) => ({ slug: c.slug, title: c.title, imagePath: c.imagePath, priceMinor: c.priceMinor, compareAtMinor: c.compareAtMinor, inStock: c.inStock })),
    categories: categories.data ?? [],
    collections: collections.data ?? [],
  };
}
