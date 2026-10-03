import "server-only";
import { searchProductsForPicker } from "@/features/catalog/server/products";
import { listCollectionOptions } from "@/features/catalog/server/collections";
import { isoToIstLocal } from "@/features/analytics/dates";
import type { DiscountFormValue } from "@/features/dashboard-ui/forms";

export async function discountPickers(tenantId: string) {
  const [products, collections] = await Promise.all([searchProductsForPicker(tenantId, undefined, [], 500), listCollectionOptions(tenantId)]);
  return { products: products.map((p) => ({ id: p.id, label: p.title })), collections: collections.map((c) => ({ id: c.id, label: c.title })) };
}

type Row = { id: string; title: string; code: string | null; automatic: boolean; type: string; value: number; applies_to: string; min_subtotal: number; max_discount: number | null; starts_at: string; ends_at: string | null; usage_limit: number | null; per_customer_limit: number | null; status: string; config: unknown };

export function toFormValue(d: Row | null, productIds: string[] = [], collectionIds: string[] = []): DiscountFormValue {
  const cfg = (d?.config ?? {}) as { buy_quantity?: number; get_quantity?: number; get_percent?: number };
  return {
    id: d?.id,
    title: d?.title ?? "",
    method: d?.automatic ? "automatic" : "code",
    code: d?.code ?? "",
    type: d?.type ?? "percentage",
    percent: d?.type === "percentage" ? String(d.value) : "10",
    amount: d?.type === "fixed_amount" ? String(d.value) : "",
    appliesTo: d?.applies_to ?? "all",
    productIds,
    collectionIds,
    minSubtotal: d ? String(d.min_subtotal) : "0",
    maxDiscount: d?.max_discount ? String(d.max_discount) : "",
    startsAt: isoToIstLocal(d?.starts_at ?? new Date().toISOString()),
    endsAt: d?.ends_at ? isoToIstLocal(d.ends_at) : "",
    usageLimit: d?.usage_limit ? String(d.usage_limit) : "",
    perCustomerLimit: d?.per_customer_limit ? String(d.per_customer_limit) : "",
    enabled: d ? d.status === "active" : true,
    buyQuantity: String(cfg.buy_quantity ?? 2),
    getQuantity: String(cfg.get_quantity ?? 1),
    getPercent: String(cfg.get_percent ?? 100),
  };
}
