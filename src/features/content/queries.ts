import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { parseStoredBlocks } from "./blocks";

export type ContentKind = "pages" | "blog";

export async function listPages(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("pages").select("id, title, slug, kind, status, updated_at").eq("tenant_id", tenantId).order("title");
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function getPage(tenantId: string, id: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("pages").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  return data ? { ...data, blocks: parseStoredBlocks(data.body) } : null;
}

export async function listPosts(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("blog_posts").select("id, title, slug, status, published_at, updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(500);
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function getPost(tenantId: string, id: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("blog_posts").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw mapDbError(error);
  return data ? { ...data, blocks: parseStoredBlocks(data.body) } : null;
}

export async function listMenus(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: menus, error }, { data: items }] = await Promise.all([
    supabase.from("menus").select("id, handle, title").eq("tenant_id", tenantId).order("handle"),
    supabase.from("menu_items").select("id, menu_id, parent_id, title, link_type, link_ref, url, highlight, position").eq("tenant_id", tenantId).order("position"),
  ]);
  if (error) throw mapDbError(error);
  return (menus ?? []).map((m) => {
    const mine = (items ?? []).filter((i) => i.menu_id === m.id);
    const top = mine.filter((i) => !i.parent_id);
    return { ...m, items: top.map((t) => ({ ...t, children: mine.filter((c) => c.parent_id === t.id) })) };
  });
}

export async function listFaqs(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("faqs").select("*").eq("tenant_id", tenantId).order("group_name").order("position");
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function listLocations(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("store_locations").select("*").eq("tenant_id", tenantId).order("position");
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function listRedirects(tenantId: string) {
  const { data, error } = await (await createSupabaseServerClient()).from("redirects").select("*").eq("tenant_id", tenantId).order("from_path").limit(1000);
  if (error) throw mapDbError(error);
  return data ?? [];
}

/** Link targets for the menu editor. */
export async function linkTargets(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const [c, cat, p, pg, b] = await Promise.all([
    supabase.from("collections").select("id, title").eq("tenant_id", tenantId).order("title"),
    supabase.from("categories").select("id, name").eq("tenant_id", tenantId).order("name"),
    supabase.from("products").select("id, title").eq("tenant_id", tenantId).eq("status", "active").order("title").limit(500),
    supabase.from("pages").select("id, title").eq("tenant_id", tenantId).order("title"),
    supabase.from("blog_posts").select("id, title").eq("tenant_id", tenantId).order("title").limit(200),
  ]);
  return {
    collection: (c.data ?? []).map((x) => ({ id: x.id, label: x.title })),
    category: (cat.data ?? []).map((x) => ({ id: x.id, label: x.name })),
    product: (p.data ?? []).map((x) => ({ id: x.id, label: x.title })),
    page: (pg.data ?? []).map((x) => ({ id: x.id, label: x.title })),
    blog: (b.data ?? []).map((x) => ({ id: x.id, label: x.title })),
  };
}
