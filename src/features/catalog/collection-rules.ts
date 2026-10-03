import { z } from "zod";
import { PRODUCT_TYPES, SCALAR_ATTRIBUTES, LIST_ATTRIBUTES } from "./constants";

/**
 * Automated collection rules (collections.rules jsonb) — pure, shared by the dashboard
 * (rules builder / preview) and the storefront (listing automated collections).
 *
 *   { "match": "all" | "any", "conditions": [ { "field", "op", "value" } ] }
 *
 * Supported conditions:
 *   product_type  eq | in        value: product type key(s)
 *   tag           eq | in        value: tag(s) (lowercase)
 *   category      eq | in        value: category uuid(s)
 *   price         lte | gte      value: rupees (number), compared with the product's lowest price
 *   on_sale       eq             value: boolean (any variant has an MRP above its price)
 *   brand         eq             value: text (case-insensitive)
 *   attribute.<k> eq | in        k in fabric/style/length/work/pattern (case-insensitive) or occasion (exact)
 *
 * `evaluateCollectionRules` checks one product in memory; `buildCollectionQuery` turns the
 * rules into PostgREST filters on the `products` table so listing stays server-side.
 * Both agree, with one documented approximation: the SQL form of `on_sale` is
 * "max_compare_at_price is set" (the DB guarantees compare_at_price >= price per variant).
 */

const TAG_RE = /^[^{}",\\()]{1,40}$/;
const attributeFields = [...SCALAR_ATTRIBUTES, ...LIST_ATTRIBUTES].map((k) => `attribute.${k}` as const);

const text = z.string().trim().min(1).max(80);
const textList = z.array(text).min(1).max(50);
const tag = z.string().trim().toLowerCase().regex(TAG_RE, "Tags can't contain { } \" , \\ ( )");

export const collectionConditionSchema = z.union([
  z.object({ field: z.literal("product_type"), op: z.literal("eq"), value: z.enum(PRODUCT_TYPES) }),
  z.object({ field: z.literal("product_type"), op: z.literal("in"), value: z.array(z.enum(PRODUCT_TYPES)).min(1).max(20) }),
  z.object({ field: z.literal("tag"), op: z.literal("eq"), value: tag }),
  z.object({ field: z.literal("tag"), op: z.literal("in"), value: z.array(tag).min(1).max(50) }),
  z.object({ field: z.literal("category"), op: z.literal("eq"), value: z.uuid() }),
  z.object({ field: z.literal("category"), op: z.literal("in"), value: z.array(z.uuid()).min(1).max(50) }),
  z.object({ field: z.literal("price"), op: z.enum(["lte", "gte"]), value: z.coerce.number().min(0).max(10_000_000) }),
  z.object({ field: z.literal("on_sale"), op: z.literal("eq"), value: z.boolean() }),
  z.object({ field: z.literal("brand"), op: z.literal("eq"), value: text }),
  ...attributeFields.flatMap((field) => [
    z.object({ field: z.literal(field), op: z.literal("eq"), value: text }),
    z.object({ field: z.literal(field), op: z.literal("in"), value: textList }),
  ]),
] as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]);

type AttributeField = (typeof attributeFields)[number];
export type CollectionCondition =
  | { field: "product_type"; op: "eq"; value: string }
  | { field: "product_type"; op: "in"; value: string[] }
  | { field: "tag"; op: "eq"; value: string }
  | { field: "tag"; op: "in"; value: string[] }
  | { field: "category"; op: "eq"; value: string }
  | { field: "category"; op: "in"; value: string[] }
  | { field: "price"; op: "lte" | "gte"; value: number }
  | { field: "on_sale"; op: "eq"; value: boolean }
  | { field: "brand"; op: "eq"; value: string }
  | { field: AttributeField; op: "eq"; value: string }
  | { field: AttributeField; op: "in"; value: string[] };

export type CollectionRules = { match: "all" | "any"; conditions: CollectionCondition[] };

export const collectionRulesSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(collectionConditionSchema).max(20, "Use at most 20 conditions"),
}) as unknown as z.ZodType<CollectionRules>;

export const EMPTY_RULES: CollectionRules = { match: "all", conditions: [] };

/** Parses stored rules leniently: invalid JSON/conditions yield an empty rule set (matches nothing). */
export function parseCollectionRules(raw: unknown): CollectionRules {
  const r = collectionRulesSchema.safeParse(raw);
  return r.success ? r.data : EMPTY_RULES;
}

/** Minimal product shape needed to evaluate rules (a `products` row fits). */
export type RuleProduct = {
  product_type: string;
  tags: string[] | null;
  category_id: string | null;
  brand: string | null;
  min_price: number | string | null;
  max_compare_at_price: number | string | null;
  attributes: unknown;
};

const lc = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const num = (v: number | string | null) => (v === null || v === "" ? null : Number(v));

function attrOf(p: RuleProduct, key: string): unknown {
  return p.attributes && typeof p.attributes === "object" && !Array.isArray(p.attributes) ? (p.attributes as Record<string, unknown>)[key] : undefined;
}

export function evaluateCondition(p: RuleProduct, c: CollectionCondition): boolean {
  const tags = (p.tags ?? []).map(lc);
  switch (c.field) {
    case "product_type":
      return c.op === "eq" ? p.product_type === c.value : c.value.includes(p.product_type);
    case "tag":
      return c.op === "eq" ? tags.includes(lc(c.value)) : c.value.some((t) => tags.includes(lc(t)));
    case "category":
      return c.op === "eq" ? p.category_id === c.value : !!p.category_id && c.value.includes(p.category_id);
    case "price": {
      const price = num(p.min_price);
      if (price === null) return false;
      return c.op === "lte" ? price <= c.value : price >= c.value;
    }
    case "on_sale": {
      const cmp = num(p.max_compare_at_price);
      const onSale = cmp !== null && cmp > 0;
      return onSale === c.value;
    }
    case "brand":
      return lc(p.brand) === lc(c.value);
    default: {
      const key = c.field.slice("attribute.".length);
      const actual = attrOf(p, key);
      const wanted = c.op === "eq" ? [c.value] : c.value;
      if ((LIST_ATTRIBUTES as readonly string[]).includes(key)) {
        const list = Array.isArray(actual) ? actual : [];
        return wanted.some((w) => list.includes(w));
      }
      return wanted.some((w) => lc(actual) === lc(w) && lc(actual) !== "");
    }
  }
}

/** True when the product satisfies the rules. An empty rule set matches nothing. */
export function evaluateCollectionRules(product: RuleProduct, rules: CollectionRules): boolean {
  if (!rules.conditions.length) return false;
  return rules.match === "any" ? rules.conditions.some((c) => evaluateCondition(product, c)) : rules.conditions.every((c) => evaluateCondition(product, c));
}

// ---------------------------------------------------------------------------
// PostgREST translation
// ---------------------------------------------------------------------------

/** Double-quotes a value for PostgREST logic trees (or=(...)); escapes \ and ". */
export function pgrstQuote(v: string | number | boolean): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escapes LIKE wildcards so ilike acts as a case-insensitive equality. */
function likeExact(v: string): string {
  return v.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const pgArray = (vals: string[]) => `{${vals.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
const orOf = (parts: string[]) => (parts.length === 1 ? parts[0]! : `or(${parts.join(",")})`);

/** One condition as a PostgREST filter expression usable inside or=(...). */
export function conditionFilter(c: CollectionCondition): string {
  switch (c.field) {
    case "product_type":
      return c.op === "eq" ? `product_type.eq.${pgrstQuote(c.value)}` : `product_type.in.(${c.value.map(pgrstQuote).join(",")})`;
    case "tag":
      return c.op === "eq" ? `tags.cs.${pgArray([lc(c.value)])}` : `tags.ov.${pgArray(c.value.map(lc))}`;
    case "category":
      return c.op === "eq" ? `category_id.eq.${c.value}` : `category_id.in.(${c.value.join(",")})`;
    case "price":
      return `min_price.${c.op}.${c.value}`;
    case "on_sale":
      return c.value ? "max_compare_at_price.gt.0" : "max_compare_at_price.is.null";
    case "brand":
      return `brand.ilike.${pgrstQuote(likeExact(c.value))}`;
    default: {
      const key = c.field.slice("attribute.".length);
      if (!/^[a-z_]{1,32}$/.test(key)) throw new Error("invalid attribute key");
      const wanted = c.op === "eq" ? [c.value] : c.value;
      if ((LIST_ATTRIBUTES as readonly string[]).includes(key)) {
        return orOf(wanted.map((w) => `attributes->${key}.cs.${pgrstQuote(JSON.stringify([w]))}`));
      }
      return orOf(wanted.map((w) => `attributes->>${key}.ilike.${pgrstQuote(likeExact(w))}`));
    }
  }
}

/** Filters to apply: for "all" each entry is its own or=() group (AND-ed); for "any" one or=() with all of them. */
export function collectionRuleFilters(rules: CollectionRules): string[] {
  if (!rules.conditions.length) return ["id.is.null"]; // matches nothing (id is never null)
  const parts = rules.conditions.map(conditionFilter);
  return rules.match === "any" ? [parts.join(",")] : parts;
}

/**
 * Applies the rules to a PostgREST query on `products`, e.g.
 *   buildCollectionQuery(supabase.from("products").select("*").eq("tenant_id", t).eq("status", "active"), rules)
 * Works with any builder exposing `.or(filters)` (each call adds an AND-ed or=() group).
 */
export function buildCollectionQuery<Q extends { or(filters: string): Q }>(query: Q, rules: CollectionRules): Q {
  return collectionRuleFilters(rules).reduce((q, f) => q.or(f), query);
}

/** Human description of a condition for lists and previews. */
export function describeCondition(c: CollectionCondition, labels: { category?: (id: string) => string } = {}): string {
  const list = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);
  switch (c.field) {
    case "product_type":
      return `Product type ${c.op === "eq" ? "is" : "is one of"} ${list(c.value)}`;
    case "tag":
      return `Tag ${c.op === "eq" ? "is" : "is one of"} ${list(c.value)}`;
    case "category": {
      const name = (id: string) => labels.category?.(id) ?? id;
      return `Category ${c.op === "eq" ? `is ${name(c.value)}` : `is one of ${c.value.map(name).join(", ")}`}`;
    }
    case "price":
      return `Price ${c.op === "lte" ? "at most" : "at least"} ₹${c.value}`;
    case "on_sale":
      return c.value ? "On sale" : "Not on sale";
    case "brand":
      return `Brand is ${c.value}`;
    default:
      return `${c.field.slice("attribute.".length)} ${c.op === "eq" ? "is" : "is one of"} ${list(c.value)}`;
  }
}
