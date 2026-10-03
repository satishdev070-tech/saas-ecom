import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { assetUrl } from "@/lib/storage/assets";
import { flattenCategoryTree, validateCategoryParent, type FlatCategory } from "../category-tree";
import { catalogDbError } from "./db-errors";
import type { z } from "zod";
import type { categorySchema } from "../schemas";

export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  status: string;
  position: number;
  imagePath: string | null;
  imageUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  productCount: number;
};

const seoOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** All categories of the tenant, depth-first with depth + ancestor path. */
export async function listCategories(tenantId: string, opts: { withCounts?: boolean } = {}): Promise<FlatCategory<CategoryRow>[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, name, slug, description, status, position, image_path, seo")
    .eq("tenant_id", tenantId)
    .order("position")
    .limit(2000);
  if (error) throw mapDbError(error);
  const counts = new Map<string, number>();
  if (opts.withCounts && data?.length) {
    const { data: prods, error: pErr } = await supabase.from("products").select("category_id").eq("tenant_id", tenantId).not("category_id", "is", null).limit(20000);
    if (pErr) throw mapDbError(pErr);
    for (const p of prods ?? []) if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }
  const rows: CategoryRow[] = (data ?? []).map((c) => {
    const seo = seoOf(c.seo);
    return {
      id: c.id,
      parentId: c.parent_id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      status: c.status,
      position: c.position,
      imagePath: c.image_path,
      imageUrl: assetUrl(c.image_path),
      seoTitle: s(seo.title),
      seoDescription: s(seo.description),
      productCount: counts.get(c.id) ?? 0,
    };
  });
  return flattenCategoryTree(rows);
}

export type CategoryInput = z.infer<typeof categorySchema>;

/** Creates or updates a category after checking the parent (no cycles, depth limit). */
export async function saveCategory(tenantId: string, input: CategoryInput, imagePath: string | null | undefined): Promise<{ id: string; oldImagePath: string | null }> {
  const supabase = await createSupabaseServerClient();
  const all = await listCategories(tenantId);
  const current = input.id ? all.find((c) => c.id === input.id) : undefined;
  if (input.id && !current) throw new AppError("NOT_FOUND");
  const parentError = validateCategoryParent(all, input.id, input.parentId);
  if (parentError) throw new AppError("VALIDATION", { fieldErrors: { parentId: [parentError] } });

  const seo: Record<string, string> = {};
  if (input.seoTitle) seo.title = input.seoTitle;
  if (input.seoDescription) seo.description = input.seoDescription;
  const row = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    parent_id: input.parentId,
    status: input.status,
    position: input.position,
    seo,
    // undefined = keep; null = remove; string = new upload
    ...(imagePath !== undefined ? { image_path: imagePath } : {}),
  };
  if (current) {
    const { error } = await supabase.from("categories").update(row).eq("tenant_id", tenantId).eq("id", current.id);
    if (error) throw catalogDbError(error);
    return { id: current.id, oldImagePath: imagePath !== undefined ? current.imagePath : null };
  }
  const { data, error } = await supabase.from("categories").insert({ ...row, tenant_id: tenantId }).select("id").single();
  if (error) throw catalogDbError(error);
  return { id: data.id, oldImagePath: null };
}

/** Deletes a category. Subcategories move up to the top level and products become uncategorised (FK set null). */
export async function deleteCategory(tenantId: string, id: string): Promise<{ name: string; imagePath: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("categories").delete().eq("tenant_id", tenantId).eq("id", id).select("name, image_path");
  if (error) throw mapDbError(error);
  const row = data?.[0];
  if (!row) throw new AppError("NOT_FOUND");
  return { name: row.name, imagePath: row.image_path };
}
