import { afterAll, describe, expect, it } from "vitest";
import { PRODUCTS, TENANTS, USERS, as, closePool, one, rejects, superuser, user } from "./db";

afterAll(closePool);

type Q = Parameters<Parameters<typeof as>[1]>[0];

const owner = user(USERS.aanganOwner);
const staff = user(USERS.aanganStaff);
const rangrez = user(USERS.rangrezOwner);

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: null,
    product: {
      title: "Test Anarkali",
      slug: `test-anarkali-${Math.random().toString(36).slice(2, 8)}`,
      product_type: "kurta",
      status: "draft",
      tags: ["new"],
      attributes: { fabric: "Silk", occasion: ["Festive"] },
    },
    options: [
      { name: "Size", values: [{ value: "S" }, { value: "M" }] },
      { name: "Colour", values: [{ value: "Red", swatch: "#aa0000" }] },
    ],
    variants: [
      { option1: "S", option2: "Red", sku: `T-S-${Math.random()}`.slice(0, 20), price: 1000, compare_at_price: 1500, initial_stock: 4 },
      { option1: "M", option2: "Red", sku: `T-M-${Math.random()}`.slice(0, 20), price: 1200 },
    ],
    ...overrides,
  };
}

async function save(q: Q, body: unknown, tenant: string = TENANTS.aangan) {
  return one(await q<{ save_product: string }>("select public.save_product($1, $2::jsonb)", [tenant, JSON.stringify(body)])).save_product;
}

async function variants(q: Q, productId: string) {
  return q<{ id: string; option1: string | null; option2: string | null; title: string; sku: string | null; status: string; price: string; position: number }>(
    "select id, option1, option2, title, sku, status, price, position from product_variants where product_id = $1 order by position",
    [productId],
  );
}

describe("save_product", () => {
  it("creates product, options, values, variants, prices and opening stock atomically", async () => {
    await as(owner, async (q) => {
      const id = await save(q, payload());
      const vs = await variants(q, id);
      expect(vs.map((v) => v.title)).toEqual(["S / Red", "M / Red"]);
      const [p] = await q<{ min_price: string; max_price: string; max_compare_at_price: string }>("select min_price, max_price, max_compare_at_price from products where id = $1", [id]);
      expect(Number(p!.min_price)).toBe(1000);
      expect(Number(p!.max_price)).toBe(1200);
      const values = await q<{ value: string; swatch: string | null }>(
        "select v.value, v.swatch from product_option_values v join product_options o on o.id = v.option_id where o.product_id = $1 order by o.position, v.position",
        [id],
      );
      expect(values).toEqual([
        { value: "S", swatch: null },
        { value: "M", swatch: null },
        { value: "Red", swatch: "#aa0000" },
      ]);
      const [lvl] = await q<{ available: number }>("select available from inventory_levels where variant_id = $1", [vs[0]!.id]);
      expect(lvl!.available).toBe(4);
    });
  });

  it("updates in place, matches by id, swaps SKUs and removes dropped variants", async () => {
    await as(owner, async (q) => {
      const body = payload();
      const id = await save(q, body);
      const [s, m] = await variants(q, id);
      const [{ updated_at }] = (await q<{ updated_at: string }>("select updated_at::text from products where id = $1", [id])) as [{ updated_at: string }];
      await save(q, {
        ...body,
        id,
        expected_updated_at: updated_at,
        options: [{ name: "Size", values: [{ value: "S" }, { value: "M" }] }],
        variants: [
          { id: m!.id, option1: "M", sku: s!.sku, price: 1300 },
          { id: s!.id, option1: "S", sku: m!.sku, price: 900 },
        ],
      });
      const vs = await variants(q, id);
      expect(vs.map((v) => [v.id, v.option1, v.option2, v.sku])).toEqual([
        [m!.id, "M", null, s!.sku],
        [s!.id, "S", null, m!.sku],
      ]);
    });
  });

  it("rejects stale edits, invalid option values and duplicates", async () => {
    await as(owner, async (q) => {
      const body = payload();
      const id = await save(q, body);
      await rejects(save(q, { ...body, id, expected_updated_at: "2000-01-01T00:00:00Z" }), /changed by someone else/);
      await rejects(save(q, { ...body, id, variants: [{ option1: "XL", option2: "Red", price: 1 }] }), /invalid value for option 1/);
      await rejects(save(q, { ...body, id, variants: [{ option1: "S", option2: "Red", price: 1 }, { option1: "S", option2: "Red", price: 2 }] }), /duplicate variant/);
      await rejects(save(q, { ...body, id, options: [], variants: [{ price: 1 }, { price: 2 }] }), /exactly one variant/);
      await rejects(save(q, { ...body, id: null, product: { ...body.product, slug: "other-slug-x", status: "active" }, variants: body.variants.map((v) => ({ ...v, status: "archived", sku: null })) }), /at least one active variant/);
      // nothing from the failed calls persisted
      expect((await variants(q, id)).length).toBe(2);
    });
  });

  it("archives (not deletes) removed variants that have orders, deletes unsold ones", async () => {
    await as(superuser, async (q) => {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      const existing = await variants(q, PRODUCTS.aanganKurta);
      const sold = existing.find((v) => v.option1 === "M")!;
      const unsold = existing.find((v) => v.option1 === "XS")!;
      await q("select public.svc_place_order($1, $2)", [
        {
          tenant_id: TENANTS.aangan, idempotency_key: `cat-${Math.random()}`, email: "b@example.test", phone: "+919811112222", payment_method: "cod",
          subtotal: 1499, discount_total: 0, shipping_total: 0, cod_fee: 0, tax_total: 0, grand_total: 1499, prices_include_tax: true,
          shipping_address: { name: "B", line1: "1 MG Road", city: "Jaipur", state: "Rajasthan", postal_code: "302001", phone: "+919811112222" },
          customer_snapshot: { email: "b@example.test" },
        },
        JSON.stringify([{ variant_id: sold.id, quantity: 1, unit_price: Number(sold.price), discount_total: 0, tax_rate: 0, tax_total: 0 }]),
      ]);
      const keep = existing.filter((v) => v.id !== sold.id && v.id !== unsold.id);
      await save(q, {
        id: PRODUCTS.aanganKurta,
        product: { title: "Indigo Dabu Straight Kurta", slug: "indigo-dabu-straight-kurta", product_type: "kurta", status: "active" },
        options: [{ name: "Size", values: keep.map((v) => ({ value: v.option1 })) }],
        variants: keep.map((v) => ({ id: v.id, option1: v.option1, sku: v.sku, price: Number(v.price) })),
      });
      const after = await variants(q, PRODUCTS.aanganKurta);
      expect(after.filter((v) => v.status === "active").map((v) => v.id)).toEqual(keep.map((v) => v.id));
      expect(after.find((v) => v.id === sold.id)?.status).toBe("archived");
      expect(after.find((v) => v.id === unsold.id)).toBeUndefined();

      // re-adding the sold combination revives the archived row (keeps its history)
      const again = await variants(q, PRODUCTS.aanganKurta);
      await save(q, {
        id: PRODUCTS.aanganKurta,
        product: { title: "Indigo Dabu Straight Kurta", slug: "indigo-dabu-straight-kurta", product_type: "kurta", status: "active" },
        options: [{ name: "Size", values: [...keep.map((v) => ({ value: v.option1 })), { value: "M" }] }],
        variants: [...again.filter((v) => v.status === "active").map((v) => ({ id: v.id, option1: v.option1, sku: v.sku, price: Number(v.price) })), { option1: "M", price: 1499 }],
      });
      const revived = (await variants(q, PRODUCTS.aanganKurta)).find((v) => v.option1 === "M");
      expect(revived).toMatchObject({ id: sold.id, status: "active" });
    });
  });

  it("is denied to viewers of other tenants and to cross-tenant product ids", async () => {
    await rejects(as(rangrez, (q) => save(q, payload(), TENANTS.aangan)), /not allowed/);
    await rejects(as(rangrez, (q) => save(q, { ...payload(), id: PRODUCTS.aanganKurta }, TENANTS.rangrez)), /product not found/);
  });

  it("staff (catalog.write) can save; category from another tenant is rejected by FK", async () => {
    await as(staff, async (q) => {
      const id = await save(q, payload());
      expect(id).toBeTruthy();
    });
    await as(rangrez, async (q) => {
      const body = payload();
      await rejects(save(q, { ...body, product: { ...body.product, category_id: "31000000-0000-4000-a000-000000000001" } }, TENANTS.rangrez), /foreign key/);
    });
  });
});

describe("set_collection_products", () => {
  const festive = "33000000-0000-4000-a000-000000000003";
  it("replaces the ordered list atomically", async () => {
    await as(owner, async (q) => {
      await q("select public.set_collection_products($1, $2::uuid[])", [festive, [PRODUCTS.aanganKurta, PRODUCTS.aanganDraft]]);
      const rows = await q<{ product_id: string; position: number }>("select product_id, position from collection_products where collection_id = $1 order by position", [festive]);
      expect(rows).toEqual([
        { product_id: PRODUCTS.aanganKurta, position: 1 },
        { product_id: PRODUCTS.aanganDraft, position: 2 },
      ]);
    });
  });
  it("rejects foreign products and other tenants", async () => {
    await rejects(as(owner, (q) => q("select public.set_collection_products($1, $2::uuid[])", [festive, [PRODUCTS.rangrezDress]])), /unknown or duplicate/);
    await rejects(as(rangrez, (q) => q("select public.set_collection_products($1, $2::uuid[])", [festive, []])), /not allowed/);
  });
});

describe("inventory_overview", () => {
  it("shows own-tenant stock with effective thresholds, nothing for other tenants", async () => {
    await as(owner, async (q) => {
      const rows = await q<{ sku: string; available: number; low_stock_threshold: number; low_stock: boolean; out_of_stock: boolean }>(
        "select sku, available, low_stock_threshold, low_stock, out_of_stock from public.inventory_overview($1) where sku = 'AAN-IDK-XS'",
        [TENANTS.aangan],
      );
      expect(rows).toEqual([{ sku: "AAN-IDK-XS", available: 2, low_stock_threshold: 5, low_stock: true, out_of_stock: false }]);
    });
    await as(rangrez, async (q) => {
      const rows = await q("select * from public.inventory_overview($1)", [TENANTS.aangan]);
      expect(rows).toEqual([]);
    });
  });
});
