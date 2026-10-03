"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, can, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import {
  bulkProductSchema,
  categorySchema,
  collectionSchema,
  idSchema,
  mediaDeleteSchema,
  mediaReorderSchema,
  mediaUpdateSchema,
  mediaUploadSchema,
  productEnvelopeSchema,
  productInputSchema,
  sizeChartSchema,
  toSaveProductPayload,
} from "./schemas";
import { assertProductCapacity, bulkUpdateProducts, deleteProduct, setProductCollections } from "./server/products";
import { addProductImage, attachLibraryImages, deleteProductImage, removeStoredFiles, reorderProductImages, updateProductImage, uploadCatalogImage } from "./server/media";
import { deleteCategory, saveCategory } from "./server/categories";
import { deleteCollection, previewRules, saveCollection } from "./server/collections";
import { deleteSizeChart, saveSizeChart } from "./server/size-charts";
import { applyImport, previewImport } from "./server/import";
import { catalogDbError } from "./server/db-errors";
import { collectionRulesSchema } from "./collection-rules";
import { adjustStockSchema, setStockSchema, thresholdSchema } from "@/features/inventory/schemas";
import { adjustStock, setLowStockThreshold, setStock } from "@/features/inventory/server/inventory";

async function writer(permission: "catalog.write" | "catalog.delete" | "inventory.write" = "catalog.write") {
  const ctx = await requireTenant();
  assertPermission(ctx, permission);
  return ctx;
}

function file(fd: FormData, key = "file"): File | null {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? f : null;
}

// ---------------------------------------------------------------- products

export async function saveProductAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  let createdId: string | null = null;
  const result = await runAction("catalog.saveProduct", async () => {
    const ctx = await writer();
    const env = parseInput(productEnvelopeSchema, formToObject(fd));
    const input = parseInput(productInputSchema, env.payload);
    if (!input.id) await assertProductCapacity(ctx.tenantId, 1);
    const supabase = await createSupabaseServerClient();
    // Going live needs catalog.publish (also enforced by a DB trigger); already-live products stay editable.
    if (input.status === "active" && !can(ctx, "catalog.publish")) {
      const { data: current } = input.id ? await supabase.from("products").select("status").eq("id", input.id).eq("tenant_id", ctx.tenantId).maybeSingle() : { data: null };
      if (current?.status !== "active") throw new AppError("FORBIDDEN", { message: "You don't have permission to publish products. Save it as a draft instead.", fieldErrors: { status: ["Needs publish permission"] } });
    }
    const payload = toSaveProductPayload(input, { allowInitialStock: can(ctx, "inventory.write") });
    const { data: id, error } = await supabase.rpc("save_product", { p_tenant: ctx.tenantId, p_payload: payload as unknown as Json });
    if (error || !id) throw catalogDbError(error, { op: "save_product" });
    await setProductCollections(ctx.tenantId, id, env.collectionIds);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: input.id ? "product.updated" : "product.created", entityType: "product", entityId: id, metadata: { status: input.status } });
    if (!input.id) createdId = id;
    return { id };
  });
  if (createdId) redirect(`/dashboard/products/${createdId}?created=1`);
  if (result.ok) refresh();
  return result;
}

export async function bulkProductsAction(_prev: ActionResult<{ changed: number; skipped: number }> | null, fd: FormData): Promise<ActionResult<{ changed: number; skipped: number }>> {
  const result = await runAction("catalog.bulk", async () => {
    const ctx = await writer();
    const input = parseInput(bulkProductSchema, formToObject(fd));
    if (input.op === "delete") assertPermission(ctx, "catalog.delete");
    if (input.op === "publish") assertPermission(ctx, "catalog.publish");
    const r = await bulkUpdateProducts(ctx.tenantId, input.op, input.ids);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `product.bulk_${input.op}`, entityType: "product", metadata: { ids: r.changed, skipped: r.skipped.length } });
    return { changed: r.changed.length, skipped: r.skipped.length };
  });
  if (result.ok) revalidatePath("/dashboard/products");
  return result;
}

export async function deleteProductAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.deleteProduct", async () => {
    const ctx = await writer("catalog.delete");
    const { id } = parseInput(idSchema, formToObject(fd));
    const removed = await deleteProduct(ctx.tenantId, id);
    await removeStoredFiles(ctx.tenantId, removed.mediaPaths);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "product.deleted", entityType: "product", entityId: id, metadata: { title: removed.title } });
  });
  if (result.ok) redirect("/dashboard/products?deleted=1");
  return result;
}

// ------------------------------------------------------------------- media

export async function uploadProductImageAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.uploadImage", async () => {
    const ctx = await writer();
    const input = parseInput(mediaUploadSchema, formToObject(fd));
    const images = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!images.length) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose at least one image"] } });
    for (const img of images.slice(0, 10)) await addProductImage(ctx.tenantId, input.productId, img, input.altText ?? null);
  });
  if (result.ok) refresh();
  return result;
}

export async function attachProductMediaAction(productId: string, paths: string[]): Promise<ActionResult<{ added: number }>> {
  const result = await runAction("catalog.attachImages", async () => {
    const ctx = await writer();
    const v = parseInput(z.object({ productId: z.uuid(), paths: z.array(z.string().max(300)).min(1).max(20) }), { productId, paths });
    const added = await attachLibraryImages(ctx.tenantId, v.productId, v.paths);
    return { added };
  });
  if (result.ok) refresh();
  return result;
}

export async function updateProductImageAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.updateImage", async () => {
    const ctx = await writer();
    const input = parseInput(mediaUpdateSchema, formToObject(fd));
    await updateProductImage(ctx.tenantId, { id: input.id, productId: input.productId, altText: input.altText ?? null, variantId: input.variantId ?? null });
  });
  if (result.ok) refresh();
  return result;
}

export async function reorderProductImagesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.reorderImages", async () => {
    const ctx = await writer();
    const input = parseInput(mediaReorderSchema, formToObject(fd));
    await reorderProductImages(ctx.tenantId, input.productId, input.ids);
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteProductImageAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.deleteImage", async () => {
    const ctx = await writer();
    const input = parseInput(mediaDeleteSchema, formToObject(fd));
    const path = await deleteProductImage(ctx.tenantId, input.productId, input.id);
    await removeStoredFiles(ctx.tenantId, [path]);
  });
  if (result.ok) refresh();
  return result;
}

// -------------------------------------------------------------- categories

/** New image for a category/collection: an uploaded file, a media-library pick, removal, or unchanged. */
async function imageFor(tenantId: string, fd: FormData, area: "categories" | "collections", remove: boolean): Promise<string | null | undefined> {
  const f = file(fd);
  if (f) return uploadCatalogImage(tenantId, area, f);
  const picked = fd.get("imagePath");
  if (typeof picked === "string" && picked) return libraryPath(tenantId, picked);
  return remove ? null : undefined;
}

/** A path chosen in the media picker must be one of this tenant's catalogued images. */
async function libraryPath(tenantId: string, path: string): Promise<string> {
  if (!path.startsWith(`tenant/${tenantId}/`)) throw new AppError("FORBIDDEN");
  const { data } = await (await createSupabaseServerClient()).from("media_assets").select("id").eq("tenant_id", tenantId).eq("storage_path", path).maybeSingle();
  if (!data) throw new AppError("VALIDATION", { fieldErrors: { file: ["That image is no longer in your media library"] } });
  return path;
}

export async function saveCategoryAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("catalog.saveCategory", async () => {
    const ctx = await writer();
    const input = parseInput(categorySchema, formToObject(fd));
    const image = await imageFor(ctx.tenantId, fd, "categories", input.removeImage);
    const r = await saveCategory(ctx.tenantId, input, image);
    if (image !== undefined && r.oldImagePath && r.oldImagePath !== image) await removeStoredFiles(ctx.tenantId, [r.oldImagePath]);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: input.id ? "category.updated" : "category.created", entityType: "category", entityId: r.id });
    return { id: r.id };
  });
  if (result.ok) revalidatePath("/dashboard/categories");
  return result;
}

export async function deleteCategoryAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.deleteCategory", async () => {
    const ctx = await writer("catalog.delete");
    const { id } = parseInput(idSchema, formToObject(fd));
    const r = await deleteCategory(ctx.tenantId, id);
    if (r.imagePath) await removeStoredFiles(ctx.tenantId, [r.imagePath]);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "category.deleted", entityType: "category", entityId: id, metadata: { name: r.name } });
  });
  if (result.ok) revalidatePath("/dashboard/categories");
  return result;
}

// ------------------------------------------------------------- collections

export async function saveCollectionAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  let created: string | null = null;
  const result = await runAction("catalog.saveCollection", async () => {
    const ctx = await writer();
    const raw = formToObject(fd);
    const input = parseInput(collectionSchema, raw);
    const image = await imageFor(ctx.tenantId, fd, "collections", raw.removeImage === "true" || raw.removeImage === "on");
    const r = await saveCollection(ctx.tenantId, input, image);
    if (image !== undefined && r.oldImagePath && r.oldImagePath !== image) await removeStoredFiles(ctx.tenantId, [r.oldImagePath]);
    if (input.type === "manual" && raw.productIdsPresent === "1") {
      const ids = parseInput(z.object({ productIds: z.array(z.uuid()).max(2000).default([]) }), { productIds: raw.productIds ?? [] }).productIds;
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.rpc("set_collection_products", { p_collection: r.id, p_product_ids: ids });
      if (error) throw catalogDbError(error, { op: "set_collection_products" });
    }
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: r.created ? "collection.created" : "collection.updated", entityType: "collection", entityId: r.id });
    if (r.created) created = r.id;
    return { id: r.id };
  });
  if (created) redirect(`/dashboard/collections/${created}?created=1`);
  if (result.ok) refresh();
  return result;
}

export async function deleteCollectionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.deleteCollection", async () => {
    const ctx = await writer("catalog.delete");
    const { id } = parseInput(idSchema, formToObject(fd));
    const r = await deleteCollection(ctx.tenantId, id);
    if (r.imagePath) await removeStoredFiles(ctx.tenantId, [r.imagePath]);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "collection.deleted", entityType: "collection", entityId: id, metadata: { title: r.title } });
  });
  if (result.ok) redirect("/dashboard/collections?deleted=1");
  return result;
}

/** Live preview of automated-collection rules (count + sample). */
export async function previewRulesAction(rulesJson: string): Promise<ActionResult<{ total: number; active: number; sample: { id: string; title: string; status: string }[] }>> {
  return runAction("catalog.previewRules", async () => {
    const ctx = await requireTenant();
    assertPermission(ctx, "catalog.read");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rulesJson);
    } catch {
      throw new AppError("VALIDATION");
    }
    const rules = parseInput(collectionRulesSchema, parsedJson);
    return previewRules(ctx.tenantId, rules);
  });
}

// ------------------------------------------------------------- size charts

export async function saveSizeChartAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("catalog.saveSizeChart", async () => {
    const ctx = await writer();
    const input = parseInput(sizeChartSchema, formToObject(fd));
    const r = await saveSizeChart(ctx.tenantId, input);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: r.created ? "size_chart.created" : "size_chart.updated", entityType: "size_chart", entityId: r.id });
    return { id: r.id };
  });
  if (result.ok) revalidatePath("/dashboard/size-charts");
  return result;
}

export async function deleteSizeChartAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.deleteSizeChart", async () => {
    const ctx = await writer();
    const { id } = parseInput(idSchema, formToObject(fd));
    const name = await deleteSizeChart(ctx.tenantId, id);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "size_chart.deleted", entityType: "size_chart", entityId: id, metadata: { name } });
  });
  if (result.ok) revalidatePath("/dashboard/size-charts");
  return result;
}

// ------------------------------------------------------------------ import

const importSchema = z.object({ mode: z.enum(["preview", "apply"]) });
type ImportState = { mode: "preview" | "apply"; summary: string; errors: string[] };

export async function importProductsAction(_prev: ActionResult<ImportState> | null, fd: FormData): Promise<ActionResult<ImportState>> {
  const result = await runAction("catalog.import", async () => {
    const ctx = await writer();
    const { mode } = parseInput(importSchema, formToObject(fd));
    const f = file(fd);
    if (!f) throw new AppError("VALIDATION", { fieldErrors: { file: ["Choose a CSV file"] } });
    if (f.size > 5 * 1024 * 1024) throw new AppError("VALIDATION", { fieldErrors: { file: ["CSV files must be 5 MB or smaller"] } });
    const text = await f.text();
    if (mode === "preview") {
      const plan = await previewImport(ctx.tenantId, text);
      if (plan.fatal) throw new AppError("VALIDATION", { fieldErrors: { file: [plan.fatal] } });
      return {
        mode,
        summary: `${plan.creates} new, ${plan.updates} updated, ${plan.invalid} with errors${plan.limit !== null ? ` · plan limit ${plan.current}/${plan.limit}` : ""}`,
        errors: plan.rowErrors.slice(0, 50).map((e) => JSON.stringify(e)),
      };
    }
    const r = await applyImport(ctx.tenantId, text, { canWriteInventory: can(ctx, "inventory.write") });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "product.imported", entityType: "product", metadata: { created: r.created, updated: r.updated, failed: r.failed.length } });
    return {
      mode,
      summary: `${r.created} created, ${r.updated} updated, ${r.stockSet} stock levels set, ${r.failed.length} failed, ${r.skipped} skipped`,
      errors: [...r.failed.map((x) => `${x.handle}: ${x.message}`), ...r.rowErrors.slice(0, 50).map((e) => JSON.stringify(e))],
    };
  });
  if (result.ok && result.data.mode === "apply") revalidatePath("/dashboard/products");
  return result;
}

// --------------------------------------------------------------- inventory

export async function adjustStockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("inventory.adjust", async () => {
    const ctx = await writer("inventory.write");
    const input = parseInput(adjustStockSchema, formToObject(fd));
    await adjustStock(ctx.tenantId, input);
  });
  if (result.ok) refresh();
  return result;
}

export async function setStockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("inventory.set", async () => {
    const ctx = await writer("inventory.write");
    const input = parseInput(setStockSchema, formToObject(fd));
    await setStock(ctx.tenantId, { variantId: input.variantId, available: input.available, note: input.note ?? null });
  });
  if (result.ok) refresh();
  return result;
}

export async function setThresholdAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("inventory.threshold", async () => {
    const ctx = await writer("inventory.write");
    const input = parseInput(thresholdSchema, formToObject(fd));
    await setLowStockThreshold(ctx.tenantId, input.variantId, input.threshold);
  });
  if (result.ok) refresh();
  return result;
}
