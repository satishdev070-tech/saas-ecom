import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError, HTTP_STATUS, toPublicError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Wraps a CSV export route handler: Next control flow (redirect to login / ?denied=1) passes
 * through; AppErrors become a plain-text response with the right status; anything else is a
 * logged 500 with a generic message.
 */
export async function exportRoute(name: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (!(err instanceof AppError) || err.code === "INTERNAL") logger.error("export.failed", { export: name, error: err });
    const pub = toPublicError(err);
    return new Response(pub.message, { status: HTTP_STATUS[pub.code], headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}
