import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toMinor } from "@/lib/money";
import { AppError } from "@/lib/errors";

/** A cart line joined with CURRENT catalog data (prices are re-read on every request). */
export type CartLine = {
  id: string;
  variantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  categoryId: string | null;
  collectionIds: string[];
  variantTitle: string | null;
  options: { name: string; value: string }[];
  imagePath: string | null;
  imageAlt: string | null;
  sku: string | null;
  /** paise */
  unitPrice: number;
  /** paise */
  compareAtPrice: number | null;
  quantity: number;
  savedForLater: boolean;
  weightGrams: number;
  /** variant + product active and published */
  purchasable: boolean;
  inStock: boolean;
  /** capped at 20 by variant_stock */
  availableQuantity: number;
  /** max quantity the shopper may put in the cart right now */
  maxQuantity: number;
};

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 50;

type VariantInfo = {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number;
  compare_at_price: number | null;
  weight_grams: number;
  status: string;
  track_inventory: boolean;
  allow_backorder: boolean;
};

/** Loads catalog data for variants of ONE tenant (admin client, tenant-filtered). */
export async function loadVariantDetails(tenantId: string, variantIds: string[]) {
  const admin = createSupabaseAdminClient();
  if (variantIds.length === 0) return new Map<string, Omit<CartLine, "id" | "quantity" | "savedForLater">>();
  const { data: variants, error } = await admin
    .from("product_variants")
    .select("id, product_id, title, sku, option1, option2, option3, price, compare_at_price, weight_grams, status, track_inventory, allow_backorder")
    .eq("tenant_id", tenantId)
    .in("id", variantIds);
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  const productIds = [...new Set((variants ?? []).map((v) => v.product_id))];

  const [products, options, media, collections, stock] = await Promise.all([
    admin.from("products").select("id, title, slug, status, published_at, category_id").eq("tenant_id", tenantId).in("id", productIds),
    admin.from("product_options").select("product_id, name, position").eq("tenant_id", tenantId).in("product_id", productIds),
    admin.from("product_media").select("product_id, variant_id, storage_path, alt_text, position, media_type").eq("tenant_id", tenantId).in("product_id", productIds).order("position"),
    admin.from("collection_products").select("product_id, collection_id").eq("tenant_id", tenantId).in("product_id", productIds),
    admin.rpc("variant_stock", { p_variant_ids: variantIds }),
  ]);
  for (const r of [products, options, media, collections]) if (r.error) throw new AppError("INTERNAL", { context: { db: r.error.message } });

  const productById = new Map((products.data ?? []).map((p) => [p.id, p]));
  const stockById = new Map((stock.data ?? []).map((s) => [s.variant_id, s]));
  const now = Date.now();
  const out = new Map<string, Omit<CartLine, "id" | "quantity" | "savedForLater">>();

  for (const v of (variants ?? []) as VariantInfo[]) {
    const p = productById.get(v.product_id);
    if (!p) continue;
    const opts = (options.data ?? [])
      .filter((o) => o.product_id === p.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ name: o.name, value: [v.option1, v.option2, v.option3][o.position - 1] ?? "" }))
      .filter((o) => o.value);
    const images = (media.data ?? []).filter((m) => m.product_id === p.id && m.media_type === "image");
    const image = images.find((m) => m.variant_id === v.id) ?? images[0] ?? null;
    const purchasable = v.status === "active" && p.status === "active" && !!p.published_at && Date.parse(p.published_at) <= now;
    const s = stockById.get(v.id);
    const inStock = purchasable && Boolean(s?.in_stock);
    const unlimited = !v.track_inventory || v.allow_backorder;
    const availableQuantity = s?.available ?? 0;
    out.set(v.id, {
      variantId: v.id,
      productId: p.id,
      productTitle: p.title,
      productSlug: p.slug,
      categoryId: p.category_id,
      collectionIds: (collections.data ?? []).filter((c) => c.product_id === p.id).map((c) => c.collection_id),
      variantTitle: v.title && v.title !== "Default" ? v.title : null,
      options: opts,
      imagePath: image?.storage_path ?? null,
      imageAlt: image?.alt_text ?? null,
      sku: v.sku,
      unitPrice: toMinor(v.price),
      compareAtPrice: v.compare_at_price === null ? null : toMinor(v.compare_at_price),
      weightGrams: v.weight_grams,
      purchasable,
      inStock,
      availableQuantity,
      maxQuantity: !inStock ? 0 : unlimited ? MAX_LINE_QUANTITY : Math.min(MAX_LINE_QUANTITY, availableQuantity),
    });
  }
  return out;
}

/** All lines of a cart (tenant-filtered), in the order they were added. */
export async function loadCartLines(tenantId: string, cartId: string): Promise<CartLine[]> {
  const admin = createSupabaseAdminClient();
  const { data: items, error } = await admin
    .from("cart_items")
    .select("id, variant_id, quantity, saved_for_later, created_at")
    .eq("tenant_id", tenantId)
    .eq("cart_id", cartId)
    .order("created_at")
    .limit(MAX_CART_LINES * 2);
  if (error) throw new AppError("INTERNAL", { context: { db: error.message } });
  if (!items?.length) return [];
  const details = await loadVariantDetails(tenantId, items.map((i) => i.variant_id));
  const lines: CartLine[] = [];
  for (const item of items) {
    const d = details.get(item.variant_id);
    if (!d) continue; // variant deleted: cascade removes the row soon; hide it now
    lines.push({ ...d, id: item.id, quantity: item.quantity, savedForLater: item.saved_for_later });
  }
  return lines;
}
