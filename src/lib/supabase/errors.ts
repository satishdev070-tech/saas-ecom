import { AppError } from "@/lib/errors";

type PgError = { code?: string; message?: string; hint?: string; details?: string } | null | undefined;

/**
 * Maps a PostgREST/Postgres error to an AppError. Business errors raised by our SQL
 * functions carry a HINT (e.g. INSUFFICIENT_STOCK) that we translate to safe messages.
 */
export function mapDbError(error: PgError, context?: Record<string, unknown>): AppError {
  const hint = error?.hint ?? "";
  const code = error?.code ?? "";
  const known: Record<string, string> = {
    INSUFFICIENT_STOCK: "Some items are out of stock in the quantity requested.",
    PRICE_CHANGED: "Prices changed while you were checking out. Please review your cart.",
    ITEM_UNAVAILABLE: "An item in your cart is no longer available.",
    DISCOUNT_INVALID: "That discount code can't be applied.",
    TENANT_UNAVAILABLE: "This store is temporarily unavailable.",
    NOT_CANCELLABLE: "This order has already shipped and can't be cancelled.",
    NOT_RETURNABLE: "Only delivered orders can be returned.",
    REFUND_TOO_LARGE: "The refund exceeds the amount paid.",
    AMOUNT_MISMATCH: "Payment amount did not match the order.",
  };
  if (hint && known[hint]) return new AppError("CONFLICT", { message: known[hint], context: { ...context, hint, detail: error?.details } });
  if (code === "42501") return new AppError("FORBIDDEN", { context: { ...context, db: error?.message } });
  if (code === "23505") return new AppError("CONFLICT", { message: "That already exists.", context: { ...context, db: error?.message } });
  if (code === "23503") return new AppError("VALIDATION", { message: "A referenced record doesn't exist.", context: { ...context, db: error?.message } });
  if (code === "23514" || code === "22023" || code === "22P02") return new AppError("VALIDATION", { context: { ...context, db: error?.message } });
  if (code === "P0002" || code === "PGRST116") return new AppError("NOT_FOUND", { context: { ...context, db: error?.message } });
  return new AppError("INTERNAL", { context: { ...context, db: error?.message, code } });
}

/** Human message for a known business hint, if the AppError came from one. */
export function isStockOrPriceConflict(err: unknown): boolean {
  return err instanceof AppError && err.code === "CONFLICT" && ["INSUFFICIENT_STOCK", "PRICE_CHANGED", "ITEM_UNAVAILABLE"].includes(String(err.context?.hint));
}
