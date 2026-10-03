import { z } from "zod";
import { SECTION_DEFINITIONS, getSectionDefinition } from "../sections/definitions";
import { SECTION_TYPES, type SectionGroup, type SectionInstance, type SectionType } from "../sections/types";
import { SECTION_ID_RE, STORAGE_PATH_RE } from "./primitives";
import { headerSettingsSchema, productCardSchema, tokensSchema, type HeaderSettings, type ProductCardSettings, type ThemeTokens } from "./tokens";

/**
 * Theme config = the JSON stored in theme_versions.config.
 *
 *   { schemaVersion, tokens, header, productCard,
 *     layout:    { header: Section[], footer: Section[] },      rendered by store/[host]/layout.tsx
 *     templates: { home: Section[], collection: Section[], product: Section[] } }
 *
 * Two parsers:
 *  - parseThemeConfigStrict(): used on SAVE. Any invalid section -> VALIDATION error with a path.
 *  - resolveThemeConfig():     used on RENDER. Never throws; invalid parts fall back per section.
 */

export const THEME_SCHEMA_VERSION = 1;
export const MAX_SECTIONS_PER_GROUP = 40;
export const MAX_CONFIG_BYTES = 256 * 1024;

export const TEMPLATE_KEYS = ["home", "collection", "product"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const LAYOUT_KEYS = ["header", "footer"] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export const visibilitySchema = z.object({ desktop: z.boolean().default(true), mobile: z.boolean().default(true) });

/** Envelope only; settings are validated against the section's own schema afterwards. */
const sectionEnvelope = z.object({
  id: z.string().regex(SECTION_ID_RE, "Invalid section id"),
  type: z.enum(SECTION_TYPES),
  settings: z.record(z.string(), z.unknown()).default({}),
  visibility: visibilitySchema.prefault({}),
});

export type ThemeConfig = {
  schemaVersion: number;
  tokens: ThemeTokens;
  header: HeaderSettings;
  productCard: ProductCardSettings;
  layout: Record<LayoutKey, SectionInstance[]>;
  templates: Record<TemplateKey, SectionInstance[]>;
};

export type ThemeIssue = { path: string; message: string };

function groupAllows(type: SectionType, group: SectionGroup): boolean {
  return (SECTION_DEFINITIONS[type].groups as readonly SectionGroup[]).includes(group);
}

function formatIssues(prefix: string, error: z.ZodError): ThemeIssue[] {
  return error.issues.map((i) => ({ path: [prefix, ...i.path.map(String)].filter(Boolean).join("."), message: i.message }));
}

function parseSectionList(raw: unknown, group: SectionGroup, path: string, issues: ThemeIssue[]): SectionInstance[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: "Expected a list of sections" });
    return [];
  }
  if (raw.length > MAX_SECTIONS_PER_GROUP) issues.push({ path, message: `At most ${MAX_SECTIONS_PER_GROUP} sections` });
  const out: SectionInstance[] = [];
  const seenIds = new Set<string>();
  const seenSingletons = new Set<string>();
  raw.slice(0, MAX_SECTIONS_PER_GROUP).forEach((item, index) => {
    const at = `${path}.${index}`;
    const env = sectionEnvelope.safeParse(item);
    if (!env.success) {
      issues.push(...formatIssues(at, env.error));
      return;
    }
    const { id, type, settings, visibility } = env.data;
    const def = getSectionDefinition(type)!;
    if (!groupAllows(type, group)) {
      issues.push({ path: at, message: `${def.label} can't be placed in ${group}` });
      return;
    }
    if (seenIds.has(id)) {
      issues.push({ path: `${at}.id`, message: "Duplicate section id" });
      return;
    }
    if (def.singleton && seenSingletons.has(type)) {
      issues.push({ path: at, message: `Only one ${def.label} is allowed here` });
      return;
    }
    const parsed = def.schema.safeParse(settings);
    if (!parsed.success) {
      issues.push(...formatIssues(`${at}.settings`, parsed.error).map((i) => ({ ...i, message: `${def.label}: ${i.message}` })));
      return; // render: skip just this section; save: the issue fails the whole save
    }
    seenIds.add(id);
    if (def.singleton) seenSingletons.add(type);
    out.push({ id, type, settings: parsed.data as Record<string, unknown>, visibility });
  });
  return out;
}

function parseObject<S extends z.ZodType>(schema: S, raw: unknown, path: string, issues: ThemeIssue[]): z.infer<S> {
  const r = schema.safeParse(raw ?? {});
  if (r.success) return r.data;
  issues.push(...formatIssues(path, r.error));
  return schema.parse({});
}

function parseAll(raw: unknown): { config: ThemeConfig; issues: ThemeIssue[] } {
  const issues: ThemeIssue[] = [];
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (raw !== undefined && obj !== raw) issues.push({ path: "", message: "Theme config must be an object" });
  const layoutRaw = (obj.layout && typeof obj.layout === "object" ? obj.layout : {}) as Record<string, unknown>;
  const templatesRaw = (obj.templates && typeof obj.templates === "object" ? obj.templates : {}) as Record<string, unknown>;
  const config: ThemeConfig = {
    schemaVersion: THEME_SCHEMA_VERSION,
    tokens: parseObject(tokensSchema, obj.tokens, "tokens", issues),
    header: parseObject(headerSettingsSchema, obj.header, "header", issues),
    productCard: parseObject(productCardSchema, obj.productCard, "productCard", issues),
    layout: {
      header: parseSectionList(layoutRaw.header, "header", "layout.header", issues),
      footer: parseSectionList(layoutRaw.footer, "footer", "layout.footer", issues),
    },
    templates: {
      home: parseSectionList(templatesRaw.home, "home", "templates.home", issues),
      collection: parseSectionList(templatesRaw.collection, "collection", "templates.collection", issues),
      product: parseSectionList(templatesRaw.product, "product", "templates.product", issues),
    },
  };
  return { config, issues };
}

/** Render-time parse: never throws; invalid tokens fall back to defaults, invalid sections are skipped. */
export function resolveThemeConfig(raw: unknown): { config: ThemeConfig; issues: ThemeIssue[] } {
  return parseAll(raw);
}

/** Save-time parse: returns the normalised config or the list of issues. */
export function parseThemeConfigStrict(raw: unknown): { ok: true; config: ThemeConfig } | { ok: false; issues: ThemeIssue[] } {
  let size = 0;
  try {
    size = JSON.stringify(raw ?? null).length;
  } catch {
    return { ok: false, issues: [{ path: "", message: "Theme config is not valid JSON" }] };
  }
  if (size > MAX_CONFIG_BYTES) return { ok: false, issues: [{ path: "", message: "Theme is too large" }] };
  const { config, issues } = parseAll(raw);
  return issues.length ? { ok: false, issues } : { ok: true, config };
}

/** Every storage path referenced anywhere in the config (for tenant-ownership checks on save). */
export function collectAssetPaths(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (STORAGE_PATH_RE.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectAssetPaths(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectAssetPaths(v, out);
  }
  return out;
}

/** True when every uploaded asset referenced by the config belongs to this tenant. */
export function assetsBelongToTenant(config: ThemeConfig, tenantId: string): boolean {
  return collectAssetPaths(config).every((p) => p.startsWith(`tenant/${tenantId}/`));
}

/** Only visible sections for the current device class are rendered; both flags false = hidden. */
export function isSectionHidden(section: SectionInstance): boolean {
  return !section.visibility.desktop && !section.visibility.mobile;
}
