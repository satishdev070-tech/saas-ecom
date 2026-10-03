import { unstable_rethrow } from "next/navigation";
import { AppError, toPublicError, type PublicError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Standard return shape for server actions. Actions never throw raw errors at the
 * client: expected failures become `{ ok: false, error }` with a safe message.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: PublicError };

/**
 * Wraps a server action body. Order inside `fn` must be:
 * validate input -> authenticate -> authorize -> execute (transaction) -> audit -> return.
 */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    // Let Next.js control-flow errors (redirect, notFound, forbidden...) propagate.
    unstable_rethrow(err);
    if (err instanceof AppError && err.code !== "INTERNAL") {
      logger.info("action.rejected", { action: name, code: err.code, context: err.context });
    } else {
      logger.error("action.failed", { action: name, error: err });
    }
    return { ok: false, error: toPublicError(err) };
  }
}
