/** Variant selection logic for the product page (pure; used by the client picker and tests). */

export type PdpOption = { name: string; position: 1 | 2 | 3; values: { value: string; swatch: string | null }[] };

export type PdpVariant = {
  id: string;
  title: string;
  sku: string | null;
  options: (string | null)[]; // [option1, option2, option3]
  priceMinor: number;
  compareAtMinor: number | null;
  inStock: boolean;
  /** Capped count from variant_stock (<= 20) or null when not tracked. */
  available: number | null;
  imagePath: string | null;
};

export type Selection = Record<number, string | undefined>; // position -> value

export function findVariant(variants: PdpVariant[], options: PdpOption[], sel: Selection): PdpVariant | null {
  if (options.length === 0) return variants[0] ?? null;
  return variants.find((v) => options.every((o) => v.options[o.position - 1] === sel[o.position])) ?? null;
}

/** Initial selection: the first in-stock variant, else the first variant. */
export function initialSelection(variants: PdpVariant[], options: PdpOption[], preferredVariantId?: string | null): Selection {
  const v = (preferredVariantId && variants.find((x) => x.id === preferredVariantId)) || variants.find((x) => x.inStock) || variants[0];
  const sel: Selection = {};
  if (!v) return sel;
  for (const o of options) sel[o.position] = v.options[o.position - 1] ?? undefined;
  return sel;
}

/**
 * State of each value of an option given the other current selections:
 * "available" (a variant exists and is in stock), "soldout" (exists, no stock), "unavailable" (no such combination).
 */
export function valueState(variants: PdpVariant[], options: PdpOption[], sel: Selection, position: number, value: string): "available" | "soldout" | "unavailable" {
  const matches = variants.filter(
    (v) => v.options[position - 1] === value && options.every((o) => o.position === position || sel[o.position] === undefined || v.options[o.position - 1] === sel[o.position]),
  );
  if (matches.length === 0) return "unavailable";
  return matches.some((m) => m.inStock) ? "available" : "soldout";
}

/** When a value is picked, keep other selections if that combination exists, otherwise snap to the best matching variant. */
export function selectValue(variants: PdpVariant[], options: PdpOption[], sel: Selection, position: number, value: string): Selection {
  const next: Selection = { ...sel, [position]: value };
  if (findVariant(variants, options, next)) return next;
  const candidates = variants.filter((v) => v.options[position - 1] === value);
  const best = candidates.find((v) => v.inStock) ?? candidates[0];
  if (!best) return next;
  const snapped: Selection = {};
  for (const o of options) snapped[o.position] = best.options[o.position - 1] ?? undefined;
  return snapped;
}

export function isColourOption(name: string): boolean {
  return /^(colou?r|shade)$/i.test(name.trim());
}
export function isSizeOption(name: string): boolean {
  return /^size$/i.test(name.trim());
}

export type StockLabel = { tone: "ok" | "low" | "out"; text: string };
export function stockLabel(v: PdpVariant | null): StockLabel {
  if (!v) return { tone: "out", text: "Unavailable" };
  if (!v.inStock) return { tone: "out", text: "Sold out" };
  if (v.available !== null && v.available > 0 && v.available <= 3) return { tone: "low", text: `Only ${v.available} left` };
  return { tone: "ok", text: "In stock" };
}
