import { SECTION_DEFINITIONS, defaultSettings } from "../sections/definitions";
import { SECTION_TYPES, type SectionInstance, type SectionType } from "../sections/types";
import type { ThemeConfig } from "../schema/config";
import type { HomeItem, ThemePreset } from "./types";

/**
 * Builds the config for "apply theme" (pure; unit tested). Style comes from the preset; content
 * (text, images, links, product/collection picks) comes from the store's current config, so a
 * theme switch never throws away the seller's work. The result goes through resolveThemeConfig
 * and is saved as a DRAFT: nothing changes on the live store until the seller publishes.
 */

/** Settings that point at the store's own content even though their values look like options. */
const CONTENT_KEYS = new Set(["source", "mode", "contentSource", "menuHandle", "menuHandles", "collectionId", "categoryId", "productIds", "categoryIds", "collectionIds"]);

function kindOf(type: SectionType, key: string): string | null {
  const shape = (SECTION_DEFINITIONS[type].schema as unknown as { shape?: Record<string, { _zod?: { def?: { type?: string; innerType?: { _zod?: { def?: { type?: string } } } } } }> }).shape;
  const def = shape?.[key]?._zod?.def;
  if (!def) return null;
  return def.type === "default" || def.type === "prefault" || def.type === "optional" ? (def.innerType?._zod?.def?.type ?? null) : (def.type ?? null);
}

/** A style setting is an enum, number or boolean that doesn't reference store content. */
export function isStyleSetting(type: SectionType, key: string): boolean {
  if (CONTENT_KEYS.has(key)) return false;
  const k = kindOf(type, key);
  return k === "enum" || k === "number" || k === "boolean";
}

const isType = (t: string): t is SectionType => (SECTION_TYPES as readonly string[]).includes(t);

function mergeSection(type: SectionType, id: string, style: Record<string, unknown>, current: SectionInstance | undefined): SectionInstance {
  const base = { ...defaultSettings(type) };
  if (current) for (const [k, v] of Object.entries(current.settings)) if (!isStyleSetting(type, k)) base[k] = v;
  for (const [k, v] of Object.entries(style)) if (isStyleSetting(type, k) || (!current && k in base)) base[k] = v;
  return { id, type, settings: base, visibility: current?.visibility ?? { desktop: true, mobile: true } };
}

/** Product grids and carousels share their content settings, so a slot can feed either. */
const PRODUCT_LISTS = new Set<string>(["ProductGrid", "ProductCarousel"]);
const sameFamily = (a: SectionType, b: SectionType) => a === b || (PRODUCT_LISTS.has(a) && PRODUCT_LISTS.has(b));

const SLOT_PREFIX = "slot-";
const HIDDEN = { desktop: false, mobile: false } as const;
const SHOWN = { desktop: true, mobile: true } as const;

/** Content pool: sections by type, plus named slots (section id `slot-<name>`). */
function makePool(sections: SectionInstance[]) {
  const byType = new Map<SectionType, SectionInstance[]>();
  for (const s of sections) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  const consumed = new Set<SectionInstance>();
  return {
    /** The slot's section if present (and of the right type), else the first unused section of the type. */
    take(type: SectionType, slot?: string): SectionInstance | undefined {
      if (slot) {
        const hit = sections.find((x) => x.id === `slot-${slot}` && sameFamily(x.type, type) && !consumed.has(x));
        if (hit) {
          consumed.add(hit);
          return hit;
        }
      }
      // Same type first; demo-pool slot sections also serve their grid/carousel sibling type.
      const free = [...(byType.get(type) ?? []), ...sections.filter((x) => x.type !== type && x.id.startsWith(SLOT_PREFIX) && sameFamily(x.type, type))].filter((x) => !consumed.has(x));
      // Unslotted items use plain sections first, so they don't take content another item's slot names.
      const next = free.find((x) => !x.id.startsWith(SLOT_PREFIX)) ?? free[0];
      if (next) consumed.add(next);
      return next;
    },
    consume(s: SectionInstance | undefined) {
      if (s) consumed.add(s);
    },
    /** Named slot sections no item used (kept hidden so a later theme switch can still use them). */
    unusedSlots(): SectionInstance[] {
      return sections.filter((x) => x.id.startsWith(SLOT_PREFIX) && !consumed.has(x));
    },
  };
}

/** Page template from a preset list, reusing the store's own content (slot first, then by type). */
function buildTemplate(list: HomeItem[], current: SectionInstance[], prefix: string): SectionInstance[] {
  const pool = makePool(current);
  const built = list
    .filter(([t]) => isType(t))
    .map(([t, style, slot], i) => {
      const type = t as SectionType;
      const cur = pool.take(type, slot);
      const hit = !!slot && cur?.id === `${SLOT_PREFIX}${slot}`;
      const s = mergeSection(type, hit ? cur.id : `${prefix}-${type.toLowerCase()}-${i + 1}`.slice(0, 40), style, cur);
      // Any pool slot a theme uses is shown, even when matched by type (pools keep unused slots hidden).
      return hit || cur?.id.startsWith(SLOT_PREFIX) ? { ...s, visibility: SHOWN } : s;
    });
  return [...built, ...pool.unusedSlots().map((x) => ({ ...x, visibility: HIDDEN }))];
}

export function applyThemePreset(current: ThemeConfig, preset: ThemePreset): unknown {
  const pool = makePool([...current.templates.home, ...current.layout.header, ...current.layout.footer]);
  const used = new Set<string>();
  const uid = (type: string, n: number) => {
    let id = `${type.toLowerCase().replace(/[^a-z0-9]/g, "")}-${n}`.slice(0, 40);
    while (used.has(id)) id = `${id.slice(0, 36)}-${used.size}`;
    used.add(id);
    return id;
  };

  // Chrome first, so a home-page section of the same type doesn't take the store's header content.
  const layoutPool = (type: SectionType, list: SectionInstance[]) => list.find((x) => x.type === type);
  const announcement = layoutPool("AnnouncementBar" as SectionType, current.layout.header);
  const header = layoutPool("Header" as SectionType, current.layout.header);
  const footer = layoutPool("Footer" as SectionType, current.layout.footer);
  for (const s of [announcement, header, footer]) pool.consume(s);

  const home = preset.home
    .filter(([t]) => isType(t))
    .map(([t, style, slot], i) => {
      const type = t as SectionType;
      const cur = pool.take(type, slot);
      // Keep slot ids, so applying another theme later still finds the same content.
      const hit = !!slot && cur?.id === `${SLOT_PREFIX}${slot}` && !used.has(cur.id);
      const id = hit ? (used.add(cur!.id), cur!.id) : uid(type, i + 1);
      const s = mergeSection(type, id, style, cur);
      // A named slot is shown when a theme asks for it (demo pools keep unused slots hidden).
      if (hit || cur?.id.startsWith(SLOT_PREFIX)) s.visibility = { ...SHOWN };
      if (type === "Hero" && Array.isArray(s.settings.slides)) {
        s.settings.slides = (s.settings.slides as Record<string, unknown>[]).map((sl) => ({ ...sl, align: preset.hero.align, textTone: preset.hero.textTone }));
      }
      return s;
    });

  const layoutHeader: SectionInstance[] = [
    mergeSection("AnnouncementBar" as SectionType, uid("announcement", 1), { tone: preset.announcementTone, mode: preset.announcementMode ?? "static" }, announcement),
    mergeSection("Header" as SectionType, uid("header", 1), { layout: preset.headerLayout, showInlineMenu: preset.inlineMenu, menuStyle: preset.menuStyle ?? "bar" }, header),
  ];
  // The inline menu only renders beside a left logo; a centred logo needs the menu bar below it.
  if ((!preset.inlineMenu || preset.headerLayout === "logo-center") && preset.menuStyle !== "drawer") {
    const mega = pool.take("MegaMenu" as SectionType);
    const m = mergeSection("MegaMenu" as SectionType, uid("megamenu", 1), { uppercase: preset.tokens.headingCase === "uppercase", showImages: true }, mega);
    layoutHeader.push({ ...m, visibility: { desktop: true, mobile: false } });
  }

  return {
    schemaVersion: current.schemaVersion,
    tokens: { ...current.tokens, ...preset.tokens, colors: { ...current.tokens.colors, ...preset.tokens.colors } },
    header: { ...current.header, ...preset.header },
    productCard: { ...current.productCard, ...preset.productCard },
    layout: { header: layoutHeader, footer: [mergeSection("Footer" as SectionType, uid("footer", 1), { tone: preset.footerTone, ...(preset.footerDecor ? { decor: preset.footerDecor } : {}) }, footer)] },
    templates: {
      // Unused named slots stay in the config, hidden, so the next theme switch still finds them.
      home: [...home, ...pool.unusedSlots().filter((x) => current.templates.home.includes(x)).map((x) => ({ ...x, visibility: { ...HIDDEN } }))],
      collection: preset.collection ? buildTemplate(preset.collection, current.templates.collection, "collection") : current.templates.collection,
      product: preset.product ? buildTemplate(preset.product, current.templates.product, "product") : current.templates.product,
    },
  };
}
