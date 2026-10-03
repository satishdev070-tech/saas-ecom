import { z } from "zod";

/**
 * Known platform_settings keys, each with its own value schema and editor kind.
 * Unknown keys found in the table are shown read-only in /admin/settings.
 * Values are stored as jsonb exactly as the schema outputs them.
 */
export type SettingKind = "boolean" | "text" | "email" | "number" | "textarea";

/** `page`: shown on that dedicated admin page instead of /admin/settings. */
type SettingDef = { key: string; label: string; description: string; kind: SettingKind; schema: z.ZodType; defaultValue: unknown; page?: "branding" | "sign-in" };

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());

export const PLATFORM_SETTINGS: readonly SettingDef[] = [
  {
    key: "signup.enabled",
    label: "Seller sign-ups open",
    description: "When off, new sellers can't create accounts or stores. Existing sellers are unaffected.",
    kind: "boolean",
    schema: z.boolean(),
    defaultValue: true,
  },
  {
    key: "support.email",
    label: "Support email",
    description: "Shown to sellers in the dashboard and on suspended-store pages.",
    kind: "email",
    schema: z.email("Enter a valid email").trim().toLowerCase().max(254),
    defaultValue: "support@example.com",
  },
  {
    key: "support.phone",
    label: "Support phone / WhatsApp",
    description: "Optional. E.164 format, e.g. +919876543210.",
    kind: "text",
    schema: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +919876543210").nullable()),
    defaultValue: null,
  },
  {
    key: "trial.default_days",
    label: "Default trial length (days)",
    description: "Used when a plan doesn't specify its own trial length.",
    kind: "number",
    schema: z.coerce.number().int().min(0).max(90),
    defaultValue: 14,
  },
  {
    key: "tenants.max_stores_per_owner",
    label: "Stores per seller account",
    description: "Self-serve limit on stores one account can own. Platform staff can create more on a seller's behalf.",
    kind: "number",
    schema: z.coerce.number().int().min(1).max(50),
    defaultValue: 5,
  },
  {
    key: "dashboard.announcement",
    label: "Dashboard announcement",
    description: "Optional banner shown to all sellers. Plain text, 200 characters max.",
    kind: "textarea",
    schema: optionalText(200),
    defaultValue: null,
  },
  // ---- Public keys (anon-readable, migration 2500); see features/platform/public-config ----
  {
    key: "public.analytics.ga4_id",
    label: "Google Analytics 4 measurement ID",
    description: "Adds the Google tag (gtag.js) to the public marketing site. Format G-XXXXXXXXXX, from GA4 → Admin → Data streams. Leave blank to remove. Visitors with Global Privacy Control or Do Not Track on are not tracked.",
    kind: "text",
    schema: z.preprocess(
      (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toUpperCase()) : v),
      z.string().regex(/^G-[A-Z0-9]{4,20}$/, "Use the GA4 measurement ID, e.g. G-AB12CD34EF").nullable(),
    ),
    defaultValue: null,
    page: "branding",
  },
  {
    key: "public.auth.google_sellers",
    label: "Google sign-in for sellers",
    description: "Shows “Continue with Google” on seller sign-in and sign-up, when the Google provider is enabled in Supabase Auth.",
    kind: "boolean",
    schema: z.boolean(),
    defaultValue: true,
    page: "sign-in",
  },
  {
    key: "public.auth.google_shoppers",
    label: "Google sign-in for store customers",
    description: "Shows “Continue with Google” on every store's customer sign-in and sign-up pages, when the Google provider is enabled in Supabase Auth.",
    kind: "boolean",
    schema: z.boolean(),
    defaultValue: true,
    page: "sign-in",
  },
  {
    key: "public.checkout.location_autofill",
    label: "“Use my location” address autofill",
    description: "Lets shoppers fill city, state and PIN code at checkout from their device location (asked by the browser, never stored). Each store can also turn it off.",
    kind: "boolean",
    schema: z.boolean(),
    defaultValue: true,
    page: "sign-in",
  },
] as const;

export const PLATFORM_SETTING_KEYS = PLATFORM_SETTINGS.map((s) => s.key);

export function settingDef(key: string): SettingDef | undefined {
  return PLATFORM_SETTINGS.find((s) => s.key === key);
}

/** Parses a submitted form value for a known key. Booleans arrive as checkbox "on"/absent. */
export function parseSettingValue(key: string, raw: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  const def = settingDef(key);
  if (!def) return { ok: false, message: "Unknown setting" };
  const input = def.kind === "boolean" ? raw === "on" || raw === "true" || raw === true : raw;
  const parsed = def.schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid value" };
  return { ok: true, value: parsed.data };
}
