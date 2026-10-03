/**
 * Application errors with a strict split between what is logged (internal detail)
 * and what may be shown to a user (safe, generic message).
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TENANT_UNAVAILABLE"
  | "INTERNAL";

const SAFE_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  VALIDATION: "Some fields need attention.",
  CONFLICT: "This was changed by someone else. Refresh and try again.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  TENANT_UNAVAILABLE: "This store is temporarily unavailable.",
  INTERNAL: "Something went wrong. Please try again.",
};

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TENANT_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Field-level messages safe to show next to form inputs. */
  readonly fieldErrors?: Record<string, string[]>;
  /** Extra context for logs only. Never sent to the client. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    options: { message?: string; fieldErrors?: Record<string, string[]>; context?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(options.message ?? SAFE_MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.context = options.context;
  }

  get publicMessage(): string {
    return SAFE_MESSAGES[this.code];
  }
}

export type PublicError = { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> };

/** Converts anything thrown into a message that is safe to return to a client. */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof AppError) {
    return { code: err.code, message: err.publicMessage, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) };
  }
  return { code: "INTERNAL", message: SAFE_MESSAGES.INTERNAL };
}
