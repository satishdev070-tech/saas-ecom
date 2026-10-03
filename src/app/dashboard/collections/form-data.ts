import "server-only";
import { listCategories } from "@/features/catalog/server/categories";
import { searchProductsForPicker } from "@/features/catalog/server/products";
import { categoryLabel } from "@/features/catalog/category-tree";

export async function collectionFormOptions(tenantId: string) {
  const [categories, products] = await Promise.all([listCategories(tenantId), searchProductsForPicker(tenantId, undefined, [], 500)]);
  return { categories: categories.map((c) => ({ id: c.id, label: categoryLabel(c) })), products: products.map((p) => ({ id: p.id, label: p.status === "active" ? p.title : `${p.title} (${p.status})` })) };
}
