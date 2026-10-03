import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { AppError } from "@/lib/errors";
import { STORE_ASSETS_BUCKET } from "@/lib/storage/assets";
import { uploadTenantImage, type UploadArea } from "@/lib/storage/upload";
import { logger } from "@/lib/observability/logger";
import { MAX_MEDIA_PER_PRODUCT } from "../constants";

/**
 * Product images. Files go to store-assets under tenant/{id}/products/ via
 * uploadTenantImage (magic-byte check, size cap, storage RLS). Rows in product_media hold
 * order, alt text and an optional variant link.
 */

async function assertProduct(tenantId: string, productId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("id", productId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return supabase;
}

export async function addProductImage(tenantId: string, productId: string, file: File, altText: string | null): Promise<{ id: string; path: string }> {
  const supabase = await assertProduct(tenantId, productId);
  const { data: existing, error } = await supabase.from("product_media").select("position").eq("tenant_id", tenantId).eq("product_id", productId);
  if (error) throw mapDbError(error);
  if ((existing ?? []).length >= MAX_MEDIA_PER_PRODUCT) {
    throw new AppError("VALIDATION", { fieldErrors: { file: [`A product can have at most ${MAX_MEDIA_PER_PRODUCT} images`] } });
  }
  const { path } = await uploadTenantImage(tenantId, "products", file);
  const position = Math.max(-1, ...(existing ?? []).map((m) => m.position)) + 1;
  const { data, error: iErr } = await supabase
    .from("product_media")
    .insert({ tenant_id: tenantId, product_id: productId, storage_path: path, alt_text: altText, media_type: "image", position })
    .select("id")
    .single();
  if (iErr) {
    await removeStoredFiles(tenantId, [path]);
    throw mapDbError(iErr);
  }
  return { id: data.id, path };
}

/** Attaches existing media-library images to a product (paths verified against this tenant's catalogue). */
export async function attachLibraryImages(tenantId: string, productId: string, paths: string[]): Promise<number> {
  const supabase = await assertProduct(tenantId, productId);
  const unique = [...new Set(paths)].filter((p) => p.startsWith(`tenant/${tenantId}/`));
  const [{ data: assets }, { data: existing, error }] = await Promise.all([
    supabase.from("media_assets").select("storage_path, alt_text, width, height").eq("tenant_id", tenantId).in("storage_path", unique),
    supabase.from("product_media").select("position, storage_path").eq("tenant_id", tenantId).eq("product_id", productId),
  ]);
  if (error) throw mapDbError(error);
  const already = new Set((existing ?? []).map((m) => m.storage_path));
  const toAdd = (assets ?? []).filter((a) => !already.has(a.storage_path));
  if ((existing ?? []).length + toAdd.length > MAX_MEDIA_PER_PRODUCT) {
    throw new AppError("VALIDATION", { message: `A product can have at most ${MAX_MEDIA_PER_PRODUCT} images.` });
  }
  if (!toAdd.length) return 0;
  let position = Math.max(-1, ...(existing ?? []).map((m) => m.position)) + 1;
  const { error: iErr } = await supabase.from("product_media").insert(
    toAdd.map((a) => ({ tenant_id: tenantId, product_id: productId, storage_path: a.storage_path, alt_text: a.alt_text, width: a.width, height: a.height, media_type: "image", position: position++ })),
  );
  if (iErr) throw mapDbError(iErr);
  return toAdd.length;
}

export async function updateProductImage(tenantId: string, input: { id: string; productId: string; altText: string | null; variantId: string | null }) {
  const supabase = await assertProduct(tenantId, input.productId);
  if (input.variantId) {
    const { data: v } = await supabase.from("product_variants").select("id").eq("tenant_id", tenantId).eq("product_id", input.productId).eq("id", input.variantId).maybeSingle();
    if (!v) throw new AppError("VALIDATION", { fieldErrors: { variantId: ["Choose a variant of this product"] } });
  }
  const { data, error } = await supabase
    .from("product_media")
    .update({ alt_text: input.altText, variant_id: input.variantId })
    .eq("tenant_id", tenantId)
    .eq("product_id", input.productId)
    .eq("id", input.id)
    .select("id");
  if (error) throw mapDbError(error);
  if (!data?.length) throw new AppError("NOT_FOUND");
}

/** Sets positions to the given order; the list must contain exactly this product's images. */
export async function reorderProductImages(tenantId: string, productId: string, ids: string[]) {
  const supabase = await assertProduct(tenantId, productId);
  const { data, error } = await supabase.from("product_media").select("id").eq("tenant_id", tenantId).eq("product_id", productId);
  if (error) throw mapDbError(error);
  const current = new Set((data ?? []).map((m) => m.id));
  if (current.size !== ids.length || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
    throw new AppError("CONFLICT", { fieldErrors: { _form: ["The images changed while you were reordering. Reload and try again."] } });
  }
  for (const [position, id] of ids.entries()) {
    const { error: uErr } = await supabase.from("product_media").update({ position }).eq("tenant_id", tenantId).eq("id", id);
    if (uErr) throw mapDbError(uErr);
  }
}

export async function deleteProductImage(tenantId: string, productId: string, id: string): Promise<string> {
  const supabase = await assertProduct(tenantId, productId);
  const { data, error } = await supabase.from("product_media").delete().eq("tenant_id", tenantId).eq("product_id", productId).eq("id", id).select("storage_path");
  if (error) throw mapDbError(error);
  const path = data?.[0]?.storage_path;
  if (!path) throw new AppError("NOT_FOUND");
  await removeStoredFiles(tenantId, [path]);
  return path;
}

/**
 * Best-effort removal of files + their media_assets rows (never throws: the DB row that
 * referenced the file is already gone, an orphaned file only costs storage).
 * Paths outside this tenant's prefix are ignored.
 */
/**
 * Deletes files that were replaced or orphaned. Never deletes media-library uploads
 * (tenant/{id}/media/…, managed from the library) or any file still referenced elsewhere
 * (products, collections, theme, pages… via media_usage), since library images are shared.
 */
export async function removeStoredFiles(tenantId: string, paths: string[]) {
  const candidates = paths.filter((p) => p.startsWith(`tenant/${tenantId}/`) && !p.startsWith(`tenant/${tenantId}/media/`));
  if (!candidates.length) return;
  try {
    const supabase = await createSupabaseServerClient();
    const own: string[] = [];
    for (const path of candidates) {
      const { data, error } = await supabase.rpc("media_usage", { p_tenant: tenantId, p_path: path });
      if (!error && !(data ?? []).length) own.push(path);
    }
    if (!own.length) return;
    const { error } = await supabase.storage.from(STORE_ASSETS_BUCKET).remove(own);
    if (error) logger.warn("catalog.storage_remove_failed", { tenantId, error: error.message });
    const { error: dbErr } = await supabase.from("media_assets").delete().eq("tenant_id", tenantId).in("storage_path", own);
    if (dbErr) logger.warn("catalog.media_asset_delete_failed", { tenantId, error: dbErr.message });
  } catch (err) {
    logger.warn("catalog.storage_remove_failed", { tenantId, error: err });
  }
}

/** Uploads a replacement image for a category/collection and returns its path (old file removed by caller). */
export async function uploadCatalogImage(tenantId: string, area: Extract<UploadArea, "categories" | "collections">, file: File): Promise<string> {
  const { path } = await uploadTenantImage(tenantId, area, file);
  return path;
}
