import { z } from "zod";

/**
 * Known platform_settings keys, each with its own value schema and editor kind.
 * Unknown keys found in the table are shown read-only in /admin/settings.
 * Values are stored as jsonb exactly as the schema outputs them.
 */
export type SettingKind = "boolean" | "text" | "email" | "number" | "textarea";

type SettingDef = { key: string; label: string; description: string; kind: SettingKind; schema: z.ZodType; defaultValue: unknown };

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
