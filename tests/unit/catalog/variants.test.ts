import { describe, expect, it } from "vitest";
import { cartesian, cleanOptions, emptyVariant, generateVariantMatrix, slugify, suggestSku, variantTitle } from "@/features/catalog/variants";
import { normalizeTags, productInputSchema, toSaveProductPayload } from "@/features/catalog/schemas";
import { emptyProductDraft } from "@/features/catalog/types";
import { readAttributes } from "@/features/storefront/server/catalog";

const opt = (name: string, ...values: string[]) => ({ name, values: values.map((value) => ({ value, swatch: "" })) });

describe("variant helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("Indigo Dabu  Straight Kurta!")).toBe("indigo-dabu-straight-kurta");
    expect(slugify("Rosé & Gold — Lehenga")).toBe("rose-and-gold-lehenga");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(200)).length).toBe(120);
  });

  it("titles and cartesian products", () => {
    expect(variantTitle({ option1: "S", option2: "Red", option3: null })).toBe("S / Red");
    expect(variantTitle({ option1: null, option2: null, option3: null })).toBe("Default");
    expect(cartesian([["a", "b"], [1, 2]] as unknown[][])).toEqual([["a", 1], ["a", 2], ["b", 1], ["b", 2]]);
    expect(cartesian([])).toEqual([[]]);
  });

  it("cleans options (blank + duplicate values removed)", () => {
    expect(cleanOptions([opt(" Size ", "S", "s", " ", "M"), opt("", "x")])).toEqual([opt("Size", "S", "M")]);
  });

  it("generates the matrix and keeps existing variants by combination", () => {
    const existing = [{ ...emptyVariant({ option1: "S", price: "999", sku: "K-S" }), id: "id-s" }];
    const out = generateVariantMatrix([opt("Size", "S", "M"), opt("Colour", "Red")], existing);
    expect(out.map(variantTitle)).toEqual(["S / Red", "M / Red"]);
    // S had no colour before, so it is a new combination but copies the template price
    expect(out[0]).toMatchObject({ id: null, price: "999", sku: "" });

    const again = generateVariantMatrix([opt("Size", "S", "M"), opt("Colour", "Red")], [{ ...out[0]!, id: "a", sku: "A" }, { ...out[1]!, id: "b" }]);
    expect(again.map((v) => v.id)).toEqual(["a", "b"]);
    expect(again[0]!.sku).toBe("A");
  });

  it("collapses to a single default variant without options", () => {
    const existing = [emptyVariant({ id: "x", option1: "S", price: "10" }), emptyVariant({ id: "y", option1: "M" })];
    const out = generateVariantMatrix([], existing);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "x", option1: null, price: "10" });
    expect(generateVariantMatrix([], [])).toHaveLength(1);
  });

  it("suggests SKUs", () => {
    expect(suggestSku("aan-idk", { option1: "M", option2: "Sky blue", option3: null })).toBe("AAN-IDK-M-SKYBLUE");
  });

  it("normalises tags", () => {
    expect(normalizeTags("New, Festive ;new,{bad}, ")).toEqual(["new", "festive", "bad"]);
  });
});

describe("productInputSchema", () => {
  const base = () => ({
    ...emptyProductDraft(),
    title: "Kurta",
    slug: "kurta",
    options: [opt("Size", "S", "M")],
    variants: [emptyVariant({ option1: "S", price: "1,499", compareAtPrice: "1999", sku: "K-S" }), emptyVariant({ option1: "M", price: "1499.5" })],
  });

  it("parses rupees to paise and builds the SQL payload", () => {
    const p = productInputSchema.parse(base());
    expect(p.variants[0]!.price).toBe(149900);
    expect(p.variants[1]!.price).toBe(149950);
    expect(p.variants[1]!.compareAtPrice).toBeNull();
    const payload = toSaveProductPayload(p, { allowInitialStock: true });
    expect(payload.variants[0]).toMatchObject({ price: "1499.00", compare_at_price: "1999.00", sku: "K-S", weight_grams: 500 });
    expect(payload.product.attributes).toEqual({});
  });

  it("keeps category specifications, dropping blank rows", () => {
    const d = base();
    d.attributes = { ...d.attributes, specs: [{ label: "Battery life", value: "30 hours" }, { label: " ", value: "" }, { label: "Weight", value: "250 g" }] };
    const p = productInputSchema.parse(d);
    expect(toSaveProductPayload(p, { allowInitialStock: false }).product.attributes).toEqual({ specs: [{ label: "Battery life", value: "30 hours" }, { label: "Weight", value: "250 g" }] });
    d.attributes.specs = [{ label: "Colour", value: "" }];
    expect(productInputSchema.safeParse(d).success).toBe(false);
    expect(readAttributes({ fabric: "Cotton", specs: [{ label: "Warranty", value: "1 year" }, { label: 3 }] })).toEqual([{ label: "Fabric", value: "Cotton" }, { label: "Warranty", value: "1 year" }]);
  });

  it("reports field paths for invalid variants", () => {
    const draft = base();
    draft.variants[1] = emptyVariant({ option1: "XL", price: "abc", sku: "k-s" });
    draft.variants[0]!.compareAtPrice = "100";
    const r = productInputSchema.safeParse(draft);
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["variants.1.price"]));
    const draft2 = base();
    draft2.variants[1] = emptyVariant({ option1: "XL", price: "10", sku: "k-s" });
    draft2.variants[0]!.compareAtPrice = "100";
    const r2 = productInputSchema.safeParse(draft2);
    const paths2 = r2.success ? [] : r2.error.issues.map((i) => i.path.join("."));
    expect(paths2).toEqual(expect.arrayContaining(["variants.1.option1", "variants.1.sku", "variants.0.compareAtPrice"]));
  });

  it("requires an active variant for an active product and one variant without options", () => {
    const d = base();
    d.status = "active";
    d.variants = d.variants.map((v) => ({ ...v, status: "archived" as const }));
    expect(productInputSchema.safeParse(d).success).toBe(false);
    const e = base();
    e.options = [];
    e.variants = [emptyVariant({ price: "1" }), emptyVariant({ price: "2" })];
    expect(productInputSchema.safeParse(e).success).toBe(false);
  });

  it("drops opening stock for existing variants or without inventory permission", () => {
    const d = base();
    d.variants[0]!.initialStock = "5";
    const p = productInputSchema.parse(d);
    expect(toSaveProductPayload(p, { allowInitialStock: true }).variants[0]!.initial_stock).toBe(5);
    expect(toSaveProductPayload(p, { allowInitialStock: false }).variants[0]!.initial_stock).toBeNull();
    const withId = productInputSchema.parse({ ...d, variants: d.variants.map((v, i) => ({ ...v, id: i === 0 ? "00000000-0000-4000-a000-000000000001" : null })) });
    expect(toSaveProductPayload(withId, { allowInitialStock: true }).variants[0]!.initial_stock).toBeNull();
  });
});
