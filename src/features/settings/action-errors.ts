import { AppError, type AppErrorCode } from "@/lib/errors";
import { mapDbError } from "@/lib/supabase/errors";

/**
 * Seller-facing error helpers for dashboard server actions (pure).
 *
 * `toPublicError()` replaces an AppError's message with the generic text for its code, so a
 * specific, safe explanation must travel as a field error. `_form` is rendered by
 * FormMessage / InlineAction / ActionDialog; a named field is rendered next to that input.
 */
export function formError(message: string, code: AppErrorCode = "CONFLICT", field = "_form"): AppError {
  return new AppError(code, { message, fieldErrors: { [field]: [message] } });
}

type PgErr = { code?: string; message?: string; hint?: string; details?: string };

/**
 * Our SQL functions raise P0001/22023 with fixed English messages. Known ones become a
 * specific seller-facing message; anything else goes through mapDbError (generic text).
 */
export function rpcError(error: PgErr, known: readonly (readonly [RegExp, string])[] = []): AppError {
  for (const [re, msg] of known) if (re.test(error.message ?? "")) return formError(msg);
  const hinted: Record<string, string> = {
    NOT_CANCELLABLE: "Shipped orders can't be cancelled. Create a return instead.",
    REFUND_TOO_LARGE: "The refund exceeds the amount paid.",
    NOT_INVOICEABLE: "Only confirmed orders can be invoiced.",
  };
  if (error.hint && hinted[error.hint]) return formError(hinted[error.hint]!);
  if (error.code === "23505") return formError("That already exists.");
  return mapDbError(error);
}
