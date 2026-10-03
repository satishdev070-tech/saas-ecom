import { z } from "zod";
import { AppError } from "@/lib/errors";

/** Reusable field schemas. Feature modules compose these; do not redefine them. */

export const uuid = z.uuid();

/** URL slug for products, collections, pages, etc. (not store slugs; see lib/tenant/host.ts). */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const email = z.email().trim().toLowerCase().max(254);

/** Indian mobile number, normalised to E.164 (+91XXXXXXXXXX). */
export const indianMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^(?:\+91|91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"))
  .transform((v) => `+91${v.slice(-10)}`);

/** Indian PIN code: 6 digits, first digit 1-9. */
export const pincode = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code");

/** GSTIN (15 chars). Structural check only; checksum validation lives with the tax module. */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GSTIN");

/**
 * Money in minor units (paise) as a safe integer. The DB stores numeric(12,2);
 * conversion happens only in the data layer (see lib/money.ts).
 */
export const moneyMinor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

/**
 * Parse input or throw a VALIDATION AppError with field-level messages.
 * Use at every server action / route handler boundary.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new AppError("VALIDATION", { fieldErrors });
}
