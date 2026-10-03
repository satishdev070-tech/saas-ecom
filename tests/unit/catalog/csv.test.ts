import { describe, expect, it } from "vitest";
import { csvCell, groupByHandle, mergeImportIntoDraft, parseCsv, parseProductCsv, toCsv, PRODUCT_CSV_COLUMNS } from "@/features/catalog/csv";
import { emptyProductDraft } from "@/features/catalog/types";
import { emptyVariant } from "@/features/catalog/variants";
import { productInputSchema } from "@/features/catalog/schemas";

describe("CSV codec", () => {
  it("parses quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""",\r\n\r\n"multi\nline",2,3';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', ""],
      ["multi\nline", "2", "3"],
    ]);
  });

  it("round-trips and guards against formula injection", () => {
    const rows = [["=SUM(A1)", "-5", "+91 98", "plain", 'q"uote', null, 12]];
    const csv = toCsv(rows);
    expect(csv).toBe(`'=SUM(A1),-5,'+91 98,plain,"q""uote",,12\r\n`);
    expect(parseCsv(csv)[0]).toEqual(["'=SUM(A1)", "-5", "'+91 98", "plain", 'q"uote', "", "12"]);
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

const header = PRODUCT_CSV_COLUMNS.join(",");
const line = (vals: Partial<Record<(typeof PRODUCT_CSV_COLUMNS)[number], string>>) => PRODUCT_CSV_COLUMNS.map((c) => csvCell(vals[c] ?? "")).join(",");

describe("parseProductCsv", () => {
  it("validates rows and reports spreadsheet row numbers", () => {
    const text = [
      header,
      line({ handle: "kurta-a", title: "Kurta A", option1_name: "Size", option1_value: "S", sku: "KA-S", price: "1499" }),
      line({ handle: "Bad Handle", price: "1" }),
      line({ handle: "kurta-a", option1_value: "M", sku: "KA-S", price: "12.345" }),
      line({ handle: "kurta-a", option2_value: "Red", sku: "KA-M", price: "10", track_inventory: "maybe" }),
    ].join("\n");
    const r = parseProductCsv(text);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([2]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(r.errors[1]!.messages.join()).toMatch(/price/);
  });

  it("enforces required header and the row cap", () => {
    expect(parseProductCsv("title\nx").fatal).toMatch(/handle/);
    expect(parseProductCsv([header, line({ handle: "a", price: "1" }), line({ handle: "b", price: "1" })].join("\n"), 1).fatal).toMatch(/at most 1/);
    expect(parseProductCsv("").fatal).toBeTruthy();
  });

  it("flags duplicate SKUs", () => {
    const r = parseProductCsv([header, line({ handle: "a", sku: "X", price: "1" }), line({ handle: "b", sku: "x", price: "1" })].join("\n"));
    expect(r.errors).toEqual([{ row: 3, messages: ["sku: duplicate of row 2"] }]);
  });
});

describe("mergeImportIntoDraft", () => {
  const cats = (s: string) => (s === "kurtas" ? "31000000-0000-4000-a000-000000000001" : null);

  it("creates a new product with options and variants", () => {
    const { rows } = parseProductCsv(
      [
        header,
        line({ handle: "kurta-a", title: "Kurta A", category: "kurtas", tags: "New, Festive", occasion: "Festive;Work", option1_name: "Size", option1_value: "S", sku: "KA-S", price: "1499", stock: "5" }),
        line({ handle: "kurta-a", option1_value: "M", sku: "KA-M", price: "1599", compare_at_price: "1999" }),
      ].join("\n"),
    );
    const groups = groupByHandle(rows);
    const { draft, errors, stock } = mergeImportIntoDraft(null, groups.get("kurta-a")!, cats);
    expect(errors).toEqual([]);
    expect(draft).toMatchObject({ slug: "kurta-a", title: "Kurta A", categoryId: "31000000-0000-4000-a000-000000000001", tags: ["new", "festive"] });
    expect(draft.attributes.occasion).toEqual(["Festive", "Work"]);
    expect(draft.options).toEqual([{ name: "Size", values: [{ value: "S", swatch: "" }, { value: "M", swatch: "" }] }]);
    expect(draft.variants.map((v) => [v.option1, v.sku, v.price, v.compareAtPrice])).toEqual([
      ["S", "KA-S", "1499", ""],
      ["M", "KA-M", "1599", "1999"],
    ]);
    expect(stock).toEqual([{ key: { sku: "KA-S", combo: JSON.stringify(["S", null, null]) }, qty: 5 }]);
    expect(productInputSchema.safeParse(draft).success).toBe(true);
  });

  it("updates existing variants by SKU and leaves others untouched", () => {
    const existing = {
      ...emptyProductDraft(),
      id: "32000000-0000-4000-a000-000000000001",
      title: "Old",
      slug: "old",
      options: [{ name: "Size", values: [{ value: "S", swatch: "" }, { value: "M", swatch: "" }] }],
      variants: [emptyVariant({ id: "v1", option1: "S", sku: "O-S", price: "100" }), emptyVariant({ id: "v2", option1: "M", sku: "O-M", price: "100" })],
    };
    const { rows } = parseProductCsv([header, line({ handle: "old", sku: "O-M", option1_name: "Size", option1_value: "M", price: "250" }), line({ handle: "old", option1_value: "L", option1_name: "Size", price: "300" })].join("\n"));
    const { draft, errors } = mergeImportIntoDraft(existing, rows, cats);
    expect(errors).toEqual([]);
    expect(draft.title).toBe("Old");
    expect(draft.variants.map((v) => [v.id, v.option1, v.price])).toEqual([
      ["v1", "S", "100"],
      ["v2", "M", "250"],
      [null, "L", "300"],
    ]);
    expect(draft.options[0]!.values.map((v) => v.value)).toEqual(["S", "M", "L"]);
  });

  it("reports missing title, unknown category and missing price", () => {
    const { rows } = parseProductCsv([header, line({ handle: "new-one", category: "nope", sku: "N-1" })].join("\n"));
    const { errors } = mergeImportIntoDraft(null, rows, cats);
    const msgs = errors.flatMap((e) => e.messages).join(" | ");
    expect(msgs).toMatch(/title: required/);
    expect(msgs).toMatch(/category: no category/);
    expect(msgs).toMatch(/price: required/);
    const noName = parseProductCsv([header, line({ handle: "x", title: "X", option1_value: "S", price: "1" })].join("\n"));
    expect(mergeImportIntoDraft(null, noName.rows, cats).errors[0]!.messages[0]).toMatch(/option1_name: required/);
  });
});
