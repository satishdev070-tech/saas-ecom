import { z } from "zod";
import { ADJUST_REASONS } from "@/features/catalog/constants";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v);
const note = z.preprocess(blank, z.string().trim().max(500, "Use at most 500 characters").optional()).transform((v) => v ?? null);

/**
 * Stock adjustment typed by a seller: a direction + positive quantity + reason. Reasons that
 * only make sense one way are enforced (receiving/returns add stock, damage removes it).
 * Becomes a signed delta for public.adjust_inventory().
 */
export const adjustStockSchema = z
  .object({
    variantId: z.uuid(),
    direction: z.enum(["add", "remove"]),
    quantity: z.coerce.number({ error: "Enter a quantity" }).int("Use a whole number").min(1, "Enter at least 1").max(100_000, "Use at most 100,000"),
    reason: z.enum(ADJUST_REASONS),
    note,
  })
  .superRefine((v, ctx) => {
    if ((v.reason === "received" || v.reason === "return") && v.direction === "remove") {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Received stock and returns add to stock" });
    }
    if (v.reason === "damage" && v.direction === "add") {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Damaged stock is removed from stock" });
    }
  })
  .transform((v) => ({ variantId: v.variantId, delta: v.direction === "add" ? v.quantity : -v.quantity, reason: v.reason, note: v.note }));

/** Absolute stock count (stock take) for public.set_inventory(). */
export const setStockSchema = z.object({
  variantId: z.uuid(),
  available: z.coerce.number({ error: "Enter a quantity" }).int("Use a whole number").min(0, "Stock can't be negative").max(1_000_000, "Use at most 1,000,000"),
  note,
});

/** Low-stock threshold override; blank = use the store default. */
export const thresholdSchema = z.object({
  variantId: z.uuid(),
  threshold: z
    .preprocess(blank, z.coerce.number().int("Use a whole number").min(0, "Use 0 or more").max(100_000).optional())
    .transform((v) => v ?? null),
});

export const INVENTORY_STOCK_FILTERS = ["all", "low", "out", "untracked"] as const;
export type InventoryStockFilter = (typeof INVENTORY_STOCK_FILTERS)[number];

export const inventoryListQuerySchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100).optional()).catch(undefined),
  stock: z.enum(INVENTORY_STOCK_FILTERS).catch("all").default("all"),
  sort: z.enum(["product", "available_asc", "available_desc", "sku"]).catch("product").default("product"),
  archived: z.preprocess((v) => v === "1" || v === "on" || v === "true", z.boolean()).catch(false),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
