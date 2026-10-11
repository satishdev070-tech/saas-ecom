import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import type { TenantContext } from "@/lib/tenant/membership";
import type { Tables } from "@/lib/supabase/database.types";
import { parseInvoiceData, type InvoiceData } from "@/features/checkout/invoice";
import { getStoreProfile } from "@/features/settings/queries";

export const PRINT_DOCS = ["invoice", "slip", "label", "thanks"] as const;
export type PrintDoc = (typeof PRINT_DOCS)[number];
export const MAX_PRINT_ORDERS = 50;

export type PrintOrder = {
  order: Tables<"orders">;
  items: Tables<"order_items">[];
  shipment: Tables<"shipments"> | null;
  invoice: InvoiceData | null;
};

/** Parses `?docs=invoice,label` (unknown names dropped; default: everything). */
export function parseDocs(raw: unknown): PrintDoc[] {
  const list = typeof raw === "string" ? raw.split(",").map((s) => s.trim()) : [];
  const docs = PRINT_DOCS.filter((d) => list.includes(d));
  return docs.length ? docs : [...PRINT_DOCS];
}

/**
 * Everything needed to print documents for up to 50 orders of the ACTIVE store, read with the
 * signed-in member's client (RLS: orders.read). Orders keep the requested order; unknown ids are
 * skipped.
 */
export async function loadPrintOrders(ctx: TenantContext, ids: string[]): Promise<{ store: Tables<"stores">; orders: PrintOrder[] }> {
  const unique = [...new Set(ids)].slice(0, MAX_PRINT_ORDERS);
  const supabase = await createSupabaseServerClient();
  const [store, orders, items, shipments, invoices] = await Promise.all([
    getStoreProfile(ctx.tenantId),
    supabase.from("orders").select("*").eq("tenant_id", ctx.tenantId).in("id", unique),
    supabase.from("order_items").select("*").eq("tenant_id", ctx.tenantId).in("order_id", unique).order("product_title"),
    supabase.from("shipments").select("*").eq("tenant_id", ctx.tenantId).in("order_id", unique).order("created_at", { ascending: false }),
    supabase.from("invoices").select("order_id, invoice_number, issued_at, data").eq("tenant_id", ctx.tenantId).in("order_id", unique),
  ]);
  for (const r of [orders, items, shipments, invoices]) if (r.error) throw mapDbError(r.error);
  const byId = new Map((orders.data ?? []).map((o) => [o.id, o]));
  return {
    store,
    orders: unique.flatMap((id) => {
      const order = byId.get(id);
      if (!order) return [];
      const inv = (invoices.data ?? []).find((i) => i.order_id === id);
      return [
        {
          order,
          items: (items.data ?? []).filter((i) => i.order_id === id),
          shipment: (shipments.data ?? []).find((s) => s.order_id === id) ?? null,
          invoice: inv ? parseInvoiceData(inv.invoice_number, inv.issued_at, store.order_prefix, inv.data) : null,
        },
      ];
    }),
  };
}
