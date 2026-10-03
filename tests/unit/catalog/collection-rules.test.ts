import { describe, expect, it } from "vitest";
import {
  buildCollectionQuery,
  collectionRuleFilters,
  collectionRulesSchema,
  conditionFilter,
  describeCondition,
  evaluateCollectionRules,
  parseCollectionRules,
  type CollectionRules,
  type RuleProduct,
} from "@/features/catalog/collection-rules";

const CAT = "31000000-0000-4000-a000-000000000001";

const kurta: RuleProduct = {
  product_type: "kurta",
  tags: ["new", "bestseller"],
  category_id: CAT,
  brand: "Aangan",
  min_price: 1499,
  max_compare_at_price: 1999,
  attributes: { fabric: "Cotton", occasion: ["Casual", "Work"], work: "Dabu print" },
};
const saree: RuleProduct = {
  product_type: "saree",
  tags: ["sale"],
  category_id: null,
  brand: null,
  min_price: "2499.00",
  max_compare_at_price: null,
  attributes: { fabric: "Mul cotton", occasion: ["Festive"] },
};

const rules = (match: "all" | "any", conditions: CollectionRules["conditions"]): CollectionRules => ({ match, conditions });

describe("evaluateCollectionRules", () => {
  it("matches the seeded rule shapes", () => {
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "tag", op: "eq", value: "new" }]))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "tag", op: "eq", value: "new" }]))).toBe(false);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "on_sale", op: "eq", value: true }]))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "on_sale", op: "eq", value: true }]))).toBe(false);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "on_sale", op: "eq", value: false }]))).toBe(true);
  });

  it("combines with all / any", () => {
    const conds: CollectionRules["conditions"] = [
      { field: "product_type", op: "eq", value: "saree" },
      { field: "price", op: "lte", value: 2000 },
    ];
    expect(evaluateCollectionRules(kurta, rules("all", conds))).toBe(false);
    expect(evaluateCollectionRules(kurta, rules("any", conds))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("any", conds))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", conds))).toBe(false);
  });

  it("handles price bounds, categories, brand and in-lists", () => {
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "price", op: "gte", value: 2499 }]))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "price", op: "gte", value: 2500 }]))).toBe(false);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "category", op: "in", value: [CAT] }]))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "category", op: "eq", value: CAT }]))).toBe(false);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "brand", op: "eq", value: "aangan" }]))).toBe(true);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "product_type", op: "in", value: ["saree", "kurta"] }]))).toBe(true);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "tag", op: "in", value: ["sale", "bestseller"] }]))).toBe(true);
  });

  it("matches attributes: scalar case-insensitively, lists exactly", () => {
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "attribute.fabric", op: "eq", value: "cotton" }]))).toBe(true);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "attribute.fabric", op: "eq", value: "cotton" }]))).toBe(false);
    expect(evaluateCollectionRules(saree, rules("all", [{ field: "attribute.occasion", op: "eq", value: "Festive" }]))).toBe(true);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "attribute.occasion", op: "in", value: ["Festive", "Work"] }]))).toBe(true);
    expect(evaluateCollectionRules(kurta, rules("all", [{ field: "attribute.pattern", op: "eq", value: "Floral" }]))).toBe(false);
  });

  it("an empty rule set matches nothing", () => {
    expect(evaluateCollectionRules(kurta, rules("all", []))).toBe(false);
    expect(evaluateCollectionRules(kurta, rules("any", []))).toBe(false);
  });
});

describe("rules schema", () => {
  it("accepts valid rules and defaults match", () => {
    const r = collectionRulesSchema.parse({ conditions: [{ field: "attribute.fabric", op: "in", value: ["Silk"] }] });
    expect(r.match).toBe("all");
  });
  it("rejects unknown fields, bad ops and unsafe tags", () => {
    expect(collectionRulesSchema.safeParse({ match: "all", conditions: [{ field: "title", op: "eq", value: "x" }] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ match: "all", conditions: [{ field: "price", op: "eq", value: 5 }] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ match: "all", conditions: [{ field: "tag", op: "eq", value: "a,b" }] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ match: "all", conditions: [{ field: "attribute.evil", op: "eq", value: "x" }] }).success).toBe(false);
  });
  it("parseCollectionRules falls back to empty on garbage", () => {
    expect(parseCollectionRules("nope")).toEqual({ match: "all", conditions: [] });
    expect(parseCollectionRules({ match: "all", conditions: [{ field: "tag", op: "eq", value: "new" }] }).conditions).toHaveLength(1);
  });
});

describe("PostgREST translation", () => {
  it("builds one filter per condition", () => {
    expect(conditionFilter({ field: "product_type", op: "eq", value: "kurta" })).toBe('product_type.eq."kurta"');
    expect(conditionFilter({ field: "product_type", op: "in", value: ["kurta", "saree"] })).toBe('product_type.in.("kurta","saree")');
    expect(conditionFilter({ field: "tag", op: "eq", value: "New" })).toBe('tags.cs.{"new"}');
    expect(conditionFilter({ field: "tag", op: "in", value: ["a", "b"] })).toBe('tags.ov.{"a","b"}');
    expect(conditionFilter({ field: "category", op: "eq", value: CAT })).toBe(`category_id.eq.${CAT}`);
    expect(conditionFilter({ field: "price", op: "lte", value: 999 })).toBe("min_price.lte.999");
    expect(conditionFilter({ field: "on_sale", op: "eq", value: true })).toBe("max_compare_at_price.gt.0");
    expect(conditionFilter({ field: "on_sale", op: "eq", value: false })).toBe("max_compare_at_price.is.null");
    expect(conditionFilter({ field: "attribute.fabric", op: "eq", value: "Cotton" })).toBe('attributes->>fabric.ilike."Cotton"');
    expect(conditionFilter({ field: "attribute.fabric", op: "in", value: ["Cotton", "Silk"] })).toBe('or(attributes->>fabric.ilike."Cotton",attributes->>fabric.ilike."Silk")');
    expect(conditionFilter({ field: "attribute.occasion", op: "eq", value: "Festive" })).toBe('attributes->occasion.cs."[\\"Festive\\"]"');
  });

  it("escapes quotes, backslashes and LIKE wildcards", () => {
    expect(conditionFilter({ field: "brand", op: "eq", value: 'A "b" 100%_x' })).toBe('brand.ilike."A \\"b\\" 100\\\\%\\\\_x"');
  });

  it("all = AND of groups, any = one OR group, empty = nothing", () => {
    const r = rules("all", [
      { field: "tag", op: "eq", value: "new" },
      { field: "price", op: "gte", value: 500 },
    ]);
    expect(collectionRuleFilters(r)).toEqual(['tags.cs.{"new"}', "min_price.gte.500"]);
    expect(collectionRuleFilters({ ...r, match: "any" })).toEqual(['tags.cs.{"new"},min_price.gte.500']);
    expect(collectionRuleFilters(rules("all", []))).toEqual(["id.is.null"]);
  });

  it("applies filters to a builder via or()", () => {
    const calls: string[] = [];
    const builder = { or(f: string) { calls.push(f); return builder; } };
    buildCollectionQuery(builder, rules("all", [{ field: "tag", op: "eq", value: "new" }, { field: "on_sale", op: "eq", value: true }]));
    expect(calls).toEqual(['tags.cs.{"new"}', "max_compare_at_price.gt.0"]);
  });

  it("describes conditions for people", () => {
    expect(describeCondition({ field: "price", op: "lte", value: 999 })).toBe("Price at most ₹999");
    expect(describeCondition({ field: "category", op: "eq", value: CAT }, { category: () => "Kurtas" })).toBe("Category is Kurtas");
  });
});
