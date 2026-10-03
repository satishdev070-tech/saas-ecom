import { z } from "zod";
import { PRODUCT_TYPES, type ListingSort } from "./constants";

/**
 * Listing filters from URL searchParams (collections, categories, search). Parsed leniently:
 * anything invalid is dropped rather than erroring, so a hand-edited URL still renders.
 */

export const LISTING_PAGE_SIZE = 24;
const LISTING_SORTS = ["featured", "newest", "best_selling", "price_asc", "price_desc", "relevance"] as const;

type RawParams = Record<string, string | string[] | undefined>;

const facetValue = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^<>\u0000-\u001f]+$/);

const many = (schema: z.ZodType<string>, max: number) =>
  z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === "string" ? x.split(",") : [])),
    z.array(z.unknown()).transform((arr) => {
      const out: string[] = [];
      for (const x of arr) {
        const r = schema.safeParse(x);
        if (r.success && !out.includes(r.data) && out.length < max) out.push(r.data);
      }
      return out;
    }),
  );

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const intInRange = (min: number, max: number) =>
  z.preprocess(first, z.coerce.number().int().min(min).max(max).optional().catch(undefined));

export const listingParamsSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(100).optional().catch(undefined)),
  sort: z.preprocess(first, z.enum(LISTING_SORTS).optional().catch(undefined)),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(500).catch(1)).default(1),
  availability: z.preprocess(first, z.enum(["in_stock"]).optional().catch(undefined)),
  min: intInRange(0, 10_000_000),
  max: intInRange(0, 10_000_000),
  type: many(z.enum(PRODUCT_TYPES), PRODUCT_TYPES.length),
  size: many(facetValue, 20),
  colour: many(facetValue, 20),
  fabric: many(facetValue, 20),
  occasion: many(facetValue, 20),
});

export type ListingFilters = {
  q: string;
  sort: ListingSort;
  page: number;
  inStock: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  types: string[];
  sizes: string[];
  colours: string[];
  fabrics: string[];
  occasions: string[];
};

export function parseListingParams(raw: RawParams, opts: { searchMode?: boolean } = {}): ListingFilters {
  const p = listingParamsSchema.parse(raw);
  const q = (p.q ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  let sort: ListingSort = p.sort ?? (opts.searchMode && q ? "relevance" : "featured");
  if (sort === "relevance" && !q) sort = "featured";
  let minPrice = p.min ?? null;
  let maxPrice = p.max ?? null;
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    q,
    sort,
    page: p.page,
    inStock: p.availability === "in_stock",
    minPrice,
    maxPrice,
    types: p.type,
    sizes: p.size,
    colours: p.colour,
    fabrics: p.fabric,
    occasions: p.occasion,
  };
}

export function activeFilterCount(f: ListingFilters): number {
  return (f.inStock ? 1 : 0) + (f.minPrice !== null || f.maxPrice !== null ? 1 : 0) + f.types.length + f.sizes.length + f.colours.length + f.fabrics.length + f.occasions.length;
}

/** Serialises filters back to a query string (stable order, defaults omitted). */
export function listingQueryString(f: ListingFilters, overrides: Partial<ListingFilters> = {}): string {
  const v = { ...f, ...overrides };
  const sp = new URLSearchParams();
  if (v.q) sp.set("q", v.q);
  if (v.sort !== "featured" && !(v.sort === "relevance" && v.q)) sp.set("sort", v.sort);
  if (v.inStock) sp.set("availability", "in_stock");
  if (v.minPrice !== null) sp.set("min", String(v.minPrice));
  if (v.maxPrice !== null) sp.set("max", String(v.maxPrice));
  for (const t of v.types) sp.append("type", t);
  for (const s of v.sizes) sp.append("size", s);
  for (const c of v.colours) sp.append("colour", c);
  for (const x of v.fabrics) sp.append("fabric", x);
  for (const o of v.occasions) sp.append("occasion", o);
  if (v.page > 1) sp.set("page", String(v.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Filters minus one value (for "remove filter" chips). Resets to page 1. */
export function withoutFilter(f: ListingFilters, key: "inStock" | "price" | "types" | "sizes" | "colours" | "fabrics" | "occasions", value?: string): ListingFilters {
  const next: ListingFilters = { ...f, page: 1 };
  if (key === "inStock") next.inStock = false;
  else if (key === "price") {
    next.minPrice = null;
    next.maxPrice = null;
  } else next[key] = f[key].filter((x) => x !== value);
  return next;
}

export type ListingRpcArgs = {
  p_query?: string;
  p_product_types?: string[];
  p_sizes?: string[];
  p_colours?: string[];
  p_fabrics?: string[];
  p_occasions?: string[];
  p_min_price?: number;
  p_max_price?: number;
  p_in_stock?: boolean;
  p_sort: string;
  p_limit: number;
  p_offset: number;
};

/** Maps filters to storefront_list_products() arguments. Prices are whole rupees. */
export function toListingRpcArgs(f: ListingFilters, pageSize = LISTING_PAGE_SIZE): ListingRpcArgs {
  const args: ListingRpcArgs = { p_sort: f.sort, p_limit: pageSize, p_offset: (f.page - 1) * pageSize };
  if (f.q) args.p_query = f.q;
  if (f.types.length) args.p_product_types = f.types;
  if (f.sizes.length) args.p_sizes = f.sizes;
  if (f.colours.length) args.p_colours = f.colours;
  if (f.fabrics.length) args.p_fabrics = f.fabrics;
  if (f.occasions.length) args.p_occasions = f.occasions;
  if (f.minPrice !== null) args.p_min_price = f.minPrice;
  if (f.maxPrice !== null) args.p_max_price = f.maxPrice;
  if (f.inStock) args.p_in_stock = true;
  return args;
}
