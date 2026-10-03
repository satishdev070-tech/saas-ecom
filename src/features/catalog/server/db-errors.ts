import "server-only";
import { AppError } from "@/lib/errors";
import { mapDbError } from "@/lib/supabase/errors";

type PgError = { code?: string; message?: string; hint?: string; details?: string } | null | undefined;

const HINTS: Record<string, string> = {
  STALE_PRODUCT: "This product was changed by someone else. Reload the page to see the latest version.",
  NO_ACTIVE_VARIANT: "An active product needs at least one active variant.",
  VARIANT_OPTIONS: "Every variant needs a value for each option.",
  DUPLICATE_VARIANT: "Two variants have the same option values.",
  OPTION_VALUES: "Every option needs at least one value.",
  VARIANT_COUNT: "A product needs between 1 and 250 variants (exactly one when it has no options).",
  TOO_MANY_OPTIONS: "Use at most 3 options.",
};

/**
 * Catalog-specific DB error mapping. Messages go into fieldErrors (the only custom text
 * that reaches the client); everything else falls back to the shared mapDbError().
 */
export function catalogDbError(error: PgError, context?: Record<string, unknown>): AppError {
  const msg = error?.message ?? "";
  const hint = error?.hint ?? "";
  if (hint === "STALE_PRODUCT") return new AppError("CONFLICT", { fieldErrors: { _form: [HINTS.STALE_PRODUCT!] }, context });
  if (HINTS[hint]) return new AppError("VALIDATION", { fieldErrors: { _form: [HINTS[hint]!] }, context: { ...context, db: msg } });
  if (error?.code === "23505") {
    if (msg.includes("products_tenant_id_slug_key")) return new AppError("VALIDATION", { fieldErrors: { slug: ["Another product already uses this URL handle"] }, context });
    if (msg.includes("product_variants_sku_key")) return new AppError("VALIDATION", { fieldErrors: { _form: ["One of these SKUs is already used by another product"] }, context });
    if (msg.includes("categories_tenant_id_slug_key")) return new AppError("VALIDATION", { fieldErrors: { slug: ["Another category already uses this URL handle"] }, context });
    if (msg.includes("collections_tenant_id_slug_key")) return new AppError("VALIDATION", { fieldErrors: { slug: ["Another collection already uses this URL handle"] }, context });
    if (msg.includes("product_options")) return new AppError("VALIDATION", { fieldErrors: { _form: ["Option names must be unique"] }, context });
    if (msg.includes("product_option_values")) return new AppError("VALIDATION", { fieldErrors: { _form: ["Option values must be unique"] }, context });
  }
  if (error?.code === "23503") return new AppError("VALIDATION", { fieldErrors: { _form: ["A selected category or size chart no longer exists"] }, context: { ...context, db: msg } });
  if (error?.code === "23514" && msg.includes("compare_at")) return new AppError("VALIDATION", { fieldErrors: { _form: ["MRP must be at least the selling price"] }, context: { ...context, db: msg } });
  if (hint === "INSUFFICIENT_STOCK") return new AppError("CONFLICT", { fieldErrors: { _form: ["Not enough stock for that adjustment."] }, context });
  if (error?.code === "22023" && /invalid quantity/.test(msg)) return new AppError("VALIDATION", { fieldErrors: { _form: ["Enter a quantity between 1 and 100,000."] }, context });
  return mapDbError(error, context);
}
