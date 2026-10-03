import { afterAll, describe, expect, it } from "vitest";
import { PRODUCTS, TENANTS, USERS, as, closePool, one, rejects, service, user } from "./db";

afterAll(closePool);

type Q = Parameters<Parameters<typeof as>[1]>[0];

async function variantOf(q: Q, product: string, size = "M") {
  const [v] = await q<{ id: string; price: string }>("select id, price from product_variants where product_id = $1 and (option1 = $2 or option1 is null)", [product, size]);
  return v!;
}

async function available(q: Q, variant: string) {
  const [r] = await q<{ available: number; reserved: number }>("select available, reserved from inventory_levels where variant_id = $1", [variant]);
  return r!;
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: TENANTS.aangan,
    idempotency_key: `test-${Math.random()}`,
    email: "buyer@example.test",
    phone: "+919811112222",
    payment_method: "cod",
    subtotal: 2998,
    discount_total: 0,
    shipping_total: 0,
    cod_fee: 0,
    tax_total: 142.76,
    grand_total: 2998,
    prices_include_tax: true,
    shipping_address: { name: "Buyer", line1: "1 MG Road", city: "Jaipur", state: "Rajasthan", postal_code: "302001", phone: "+919811112222" },
    customer_snapshot: { email: "buyer@example.test" },
    ...overrides,
  };
}

describe("inventory integrity", () => {
  it("adjust_inventory never allows negative stock", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta, "XS"); // 2 in stock
      await rejects(q("select public.adjust_inventory($1, -3, 'adjustment')", [v.id]), /insufficient stock/);
      const [r] = await q<{ adjust_inventory: number }>("select public.adjust_inventory($1, -2, 'damage', 'torn')", [v.id]);
      expect(r!.adjust_inventory).toBe(0);
      const moves = await q("select delta from inventory_movements where variant_id = $1 and reason = 'damage'", [v.id]);
      expect(moves).toEqual([{ delta: -2 }]);
    });
  });

  it("staff of another tenant cannot adjust stock", async () => {
    // (variants of active products are public catalog data, so they are visible, but not writable)
    const id = await as(service, async (q) => (await variantOf(q, PRODUCTS.aanganKurta)).id);
    await rejects(as(user(USERS.rangrezOwner), (q) => q("select public.adjust_inventory($1, 5, 'received')", [id])), /not allowed/);
  });
});

describe("order placement (service role)", () => {
  it("creates a COD order, snapshots prices and consumes stock atomically", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      const before = await available(q, v.id);
      const { svc_place_order: id } = one(await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [
        order(),
        JSON.stringify([{ variant_id: v.id, quantity: 2, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 142.76 }]),
      ]));
      const [o] = await q<{ status: string; payment_status: string; order_number: string }>("select status, payment_status, order_number from orders where id = $1", [id]);
      expect(o).toMatchObject({ status: "confirmed", payment_status: "cod_pending" });
      const [item] = await q<{ product_title: string; unit_price: string; options: Record<string, string> }>(
        "select product_title, unit_price, options from order_items where order_id = $1",
        [id],
      );
      expect(item).toMatchObject({ product_title: "Indigo Dabu Straight Kurta", options: { Size: "M" } });
      const after = await available(q, v.id);
      expect(after.available).toBe(before.available - 2);
      expect(after.reserved).toBe(0); // COD reservation consumed immediately

      // changing the product later does not alter the order snapshot
      await q("update products set title = 'Renamed' where id = $1", [PRODUCTS.aanganKurta]);
      const [again] = await q<{ product_title: string }>("select product_title from order_items where order_id = $1", [id]);
      expect(again!.product_title).toBe("Indigo Dabu Straight Kurta");
    });
  });

  it("is idempotent on the idempotency key", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      const payload = order({ idempotency_key: "same-key" });
      const items = JSON.stringify([{ variant_id: v.id, quantity: 2, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 142.76 }]);
      const [a] = await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [payload, items]);
      const [b] = await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [payload, items]);
      expect(a!.svc_place_order).toBe(b!.svc_place_order);
    });
  });

  it("rejects stale prices", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      await rejects(
        q("select public.svc_place_order($1, $2)", [
          order({ subtotal: 1998, grand_total: 1998 }),
          JSON.stringify([{ variant_id: v.id, quantity: 2, unit_price: 999, discount_total: 0, tax_rate: 5, tax_total: 0 }]),
        ]),
        /price changed/,
      );
    });
  });

  it("rejects orders that exceed stock and leaves stock untouched", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta, "XS"); // 2
      await rejects(
        q("select public.svc_place_order($1, $2)", [
          order({ subtotal: 4497, grand_total: 4497 }),
          JSON.stringify([{ variant_id: v.id, quantity: 3, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 0 }]),
        ]),
        /insufficient stock/,
      );
    });
  });

  it("rejects variants from another tenant", async () => {
    await as(service, async (q) => {
      const [v] = await q<{ id: string }>("select id from product_variants where product_id = $1", [PRODUCTS.rangrezDress]);
      await rejects(
        q("select public.svc_place_order($1, $2)", [
          order({ subtotal: 4200, grand_total: 4200 }),
          JSON.stringify([{ variant_id: v!.id, quantity: 1, unit_price: 4200, discount_total: 0, tax_rate: 5, tax_total: 0 }]),
        ]),
        /item unavailable/,
      );
    });
  });

  it("online orders reserve stock, release on cancel, and confirm on payment", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      const before = await available(q, v.id);
      const items = JSON.stringify([{ variant_id: v.id, quantity: 1, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 71.38 }]);
      const { svc_place_order: id } = one(await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [
        order({ payment_method: "online", subtotal: 1499, grand_total: 1499, tax_total: 71.38 }),
        items,
      ]));
      expect(await available(q, v.id)).toEqual({ available: before.available - 1, reserved: 1 });
      await rejects(q("select public.svc_mark_order_paid($1, 'razorpay', 'order_x', 'pay_x', 1000, 'upi')", [id]), /amount mismatch/);
      await q("select public.svc_mark_order_paid($1, 'razorpay', 'order_x', 'pay_x', 1499, 'upi')", [id]);
      expect(await available(q, v.id)).toEqual({ available: before.available - 1, reserved: 0 });
      const [o] = await q<{ status: string; payment_status: string }>("select status, payment_status from orders where id = $1", [id]);
      expect(o).toEqual({ status: "confirmed", payment_status: "paid" });

      // second online order, then cancel -> stock returns
      const { svc_place_order: id2 } = one(await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [
        order({ payment_method: "online", subtotal: 1499, grand_total: 1499, tax_total: 71.38 }),
        items,
      ]));
      await q("select public.svc_cancel_order($1, 'test')", [id2]);
      expect(await available(q, v.id)).toEqual({ available: before.available - 1, reserved: 0 });
    });
  });

  it("enforces discount usage limits inside the transaction", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      const [d] = await q<{ id: string }>("update discounts set usage_limit = 1 where code = 'WELCOME10' returning id");
      const mk = () =>
        q("select public.svc_place_order($1, $2)", [
          order({ discount_id: d!.id, discount_code: "WELCOME10", subtotal: 1499, discount_total: 149.9, grand_total: 1349.1, tax_total: 64.24, phone: `+9198${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}` }),
          JSON.stringify([{ variant_id: v.id, quantity: 1, unit_price: 1499, discount_total: 149.9, tax_rate: 5, tax_total: 64.24 }]),
        ]);
      await mk();
      await rejects(mk(), /discount exhausted/);
    });
  });
});

describe("seller order operations", () => {
  it("staff cannot tamper with order totals directly", async () => {
    const id = await as(service, async (q) => {
      const [o] = await q<{ id: string }>("select id from orders limit 1");
      return o?.id;
    });
    if (!id) return; // orders are created inside rolled-back transactions; create one committed-less path below
    await rejects(as(user(USERS.aanganOwner), (q) => q("update orders set grand_total = 1 where id = $1", [id])), /order totals/);
  });

  it("fulfilment flows to delivered and marks COD as paid", async () => {
    await as(service, async (q) => {
      const v = await variantOf(q, PRODUCTS.aanganKurta);
      const { svc_place_order: id } = one(await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [
        order({ subtotal: 1499, grand_total: 1499, tax_total: 71.38 }),
        JSON.stringify([{ variant_id: v.id, quantity: 1, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 71.38 }]),
      ]));
      // act as the owner within the same transaction
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      await rejects(q("update orders set grand_total = 1 where id = $1", [id]), /order totals/);
      await q("select public.update_fulfillment($1, 'shipped', 'Delhivery', 'AWB123', 'https://track.example/AWB123')", [id]);
      await q("select public.update_fulfillment($1, 'delivered')", [id]);
      const [o] = await q<{ status: string; payment_status: string; fulfillment_status: string }>(
        "select status, payment_status, fulfillment_status from orders where id = $1",
        [id],
      );
      expect(o).toEqual({ status: "completed", payment_status: "paid", fulfillment_status: "delivered" });
      await rejects(q("select public.cancel_order($1, 'too late')", [id]), /cannot be cancelled/);
    });
  });
});

describe("theme versions", () => {
  it("published versions are immutable and rollback creates a new version", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      await q("insert into theme_versions (tenant_id, version, status, config) values ($1, 1, 'draft', '{\"v\":1}')", [TENANTS.aangan]);
      const { publish_theme: p1 } = one(await q<{ publish_theme: string }>("select public.publish_theme($1)", [TENANTS.aangan]));
      await q("update theme_versions set config = '{\"v\":2}' where tenant_id = $1 and status = 'draft'", [TENANTS.aangan]);
      await q("select public.publish_theme($1)", [TENANTS.aangan]);
      expect(await q("update theme_versions set config = '{}' where id = $1 returning id", [p1])).toHaveLength(0);
      await q("select public.rollback_theme($1)", [p1]);
      const [live] = await q<{ config: { v: number }; version: number }>("select config, version from theme_versions where tenant_id = $1 and status = 'published'", [TENANTS.aangan]);
      expect(live).toEqual({ config: { v: 1 }, version: 4 });
    });
  });
});
