/**
 * Pure helpers for product options and the variant matrix (shared by the editor, the CSV
 * importer and tests). The database re-validates everything in public.save_product().
 */

export type OptionValueDraft = { value: string; swatch: string };
export type OptionDraft = { name: string; values: OptionValueDraft[] };

export type VariantDraft = {
  id: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string;
  barcode: string;
  /** Rupees as typed, e.g. "1499" or "1499.50". */
  price: string;
  compareAtPrice: string;
  costPrice: string;
  weightGrams: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  lowStockThreshold: string;
  status: "active" | "archived";
  /** Opening stock for NEW variants only (ignored for existing ones; use Inventory). */
  initialStock: string;
};

/** URL slug from free text (ASCII, lowercase, single hyphens). */
export function slugify(input: string, max = 120): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** "S / Red" or "Default" — same rule as the SQL function. */
export function variantTitle(v: Pick<VariantDraft, "option1" | "option2" | "option3">): string {
  const parts = [v.option1, v.option2, v.option3].filter((x): x is string => !!x);
  return parts.length ? parts.join(" / ") : "Default";
}

export function comboKey(v: Pick<VariantDraft, "option1" | "option2" | "option3">): string {
  return JSON.stringify([v.option1 ?? null, v.option2 ?? null, v.option3 ?? null]);
}

/** Cartesian product of lists: [[a,b],[1,2]] -> [[a,1],[a,2],[b,1],[b,2]]. */
export function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])), [[]]);
}

export function emptyVariant(defaults: Partial<VariantDraft> = {}): VariantDraft {
  return {
    id: null,
    option1: null,
    option2: null,
    option3: null,
    sku: "",
    barcode: "",
    price: "",
    compareAtPrice: "",
    costPrice: "",
    weightGrams: "500",
    trackInventory: true,
    allowBackorder: false,
    lowStockThreshold: "",
    status: "active",
    initialStock: "",
    ...defaults,
  };
}

/** Options with blank names/values removed and values de-duplicated (case-insensitive). */
export function cleanOptions(options: OptionDraft[]): OptionDraft[] {
  return options
    .map((o) => {
      const seen = new Set<string>();
      const values = o.values
        .map((v) => ({ value: v.value.trim(), swatch: v.swatch.trim() }))
        .filter((v) => {
          const k = v.value.toLowerCase();
          if (!v.value || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      return { name: o.name.trim(), values };
    })
    .filter((o) => o.name && o.values.length);
}

/**
 * Regenerates the variant list for the given options. Existing variants whose option
 * combination still exists keep their id and every field (price, SKU, stock settings);
 * new combinations copy pricing from the first existing variant (or `defaults`).
 * With no options the product has exactly one "Default" variant.
 */
export function generateVariantMatrix(options: OptionDraft[], existing: VariantDraft[], defaults: Partial<VariantDraft> = {}): VariantDraft[] {
  const opts = cleanOptions(options).slice(0, 3);
  const template = existing[0];
  const base: Partial<VariantDraft> = template
    ? {
        price: template.price,
        compareAtPrice: template.compareAtPrice,
        costPrice: template.costPrice,
        weightGrams: template.weightGrams,
        trackInventory: template.trackInventory,
        allowBackorder: template.allowBackorder,
        lowStockThreshold: template.lowStockThreshold,
        ...defaults,
      }
    : defaults;

  if (opts.length === 0) {
    const keep = existing.find((v) => !v.option1 && !v.option2 && !v.option3) ?? existing[0];
    return [keep ? { ...keep, option1: null, option2: null, option3: null } : emptyVariant(base)];
  }

  const byCombo = new Map(existing.map((v) => [comboKey(v), v]));
  return cartesian(opts.map((o) => o.values.map((v) => v.value))).map((combo) => {
    const key = { option1: combo[0] ?? null, option2: combo[1] ?? null, option3: combo[2] ?? null };
    const found = byCombo.get(comboKey(key));
    return found ? { ...found, ...key } : emptyVariant({ ...base, ...key });
  });
}

/** Suggested SKU for a variant, e.g. base "AAN-IDK" + ["M","Red"] -> "AAN-IDK-M-RED". */
export function suggestSku(base: string, v: Pick<VariantDraft, "option1" | "option2" | "option3">): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10);
  const parts = [base.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-"), ...[v.option1, v.option2, v.option3].filter((x): x is string => !!x).map(clean)].filter(Boolean);
  return parts.join("-").slice(0, 64);
}
