import { z } from "zod";
import { toMinor } from "@/lib/money";
import { checkbox } from "@/lib/actions/form";

/**
 * Form-field zod helpers shared by the seller dashboard features (settings, marketing,
 * orders, customers, content). Inputs arrive from formToObject(): strings, or undefined
 * when blank. Pure module (safe for client and tests).
 */

const RUPEES_RE = /^\d{1,10}(?:\.\d{1,2})?$/;

/** Rupee amount typed by a seller ("1299", "1,299.50") → integer paise. */
export const rupees = z
  .string({ error: "Enter an amount" })
  .trim()
  .transform((v) => v.replace(/[,₹\s]/g, ""))
  .pipe(z.string().regex(RUPEES_RE, "Enter an amount like 499 or 499.50"))
  .transform((v) => toMinor(v));

/** Optional rupee amount → paise or null. */
export const optionalRupees = z.preprocess((v) => (v === undefined || v === null || v === "" ? null : v), rupees.nullable());

/** Rupee amount defaulting to 0 when blank. */
export const rupeesOrZero = z.preprocess((v) => (v === undefined || v === null || v === "" ? "0" : v), rupees);

export const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === null || v === "" ? null : v), z.coerce.number().int("Whole numbers only").min(min).max(max).nullable());

export const intWithDefault = (min: number, max: number, dflt: number) =>
  z.preprocess((v) => (v === undefined || v === null || v === "" ? dflt : v), z.coerce.number().int("Whole numbers only").min(min).max(max));

export const bool = z.preprocess((v) => checkbox(v), z.boolean());

export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

/** Comma/newline separated tags → unique lowercase-trimmed list. */
export const tagList = (maxTags = 50, maxLen = 40) =>
  z
    .preprocess((v) => (v === undefined || v === null ? "" : Array.isArray(v) ? v.join(",") : v), z.string())
    .transform((s) =>
      [...new Set(s.split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    )
    .pipe(z.array(z.string().max(maxLen, `Tags must be ${maxLen} characters or fewer`)).max(maxTags, `At most ${maxTags} tags`));

/** Optional https URL (social links, tracking URLs). */
export const optionalHttpsUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Use a full https:// link")
    .optional(),
);

/** Array of UUIDs from repeated form fields (e.g. productIds[]). */
export const uuidList = (max = 500) =>
  z.preprocess((v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid()).max(max)).transform((a) => [...new Set(a)]);

/** Convert paise to the numeric value PostgREST expects for numeric(12,2) columns. */
export function minorToDb(minor: number): number {
  return minor / 100;
}
