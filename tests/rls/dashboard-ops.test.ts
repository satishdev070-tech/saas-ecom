import { afterAll, describe, expect, it } from "vitest";
import { as, closePool, one, rejects, superuser, PRODUCTS, TENANTS, USERS, user, anon } from "./db";

const MAIN_MENU = "34000000-0000-4000-a000-000000000001";

afterAll(closePool);

describe("list_tenant_members", () => {
  it("returns members with emails to members.manage holders", async () => {
    const rows = await as(user(USERS.aanganOwner), (q) => q<{ email: string; role: string }>("select * from public.list_tenant_members($1)", [TENANTS.aangan]));
    expect(rows.map((r) => [r.email, r.role])).toEqual([
      ["owner@aangan.test", "owner"],
      ["staff@aangan.test", "staff"],
    ]);
  });

  it("rejects staff and members of other tenants", async () => {
    await as(user(USERS.aanganStaff), (q) => rejects(q("select * from public.list_tenant_members($1)", [TENANTS.aangan]), /not allowed/));
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select * from public.list_tenant_members($1)", [TENANTS.aangan]), /not allowed/));
  });

  it("is not callable by anon", async () => {
    await as(anon, (q) => rejects(q("select * from public.list_tenant_members($1)", [TENANTS.aangan]), /permission denied/));
  });
});

describe("replace_menu_items", () => {
  const items = JSON.stringify([
    { title: "Home", link_type: "home" },
    { title: "Shop", link_type: "url", url: "/collections/all", children: [{ title: "Kurtas", link_type: "category", link_ref: "31000000-0000-4000-a000-000000000001" }] },
  ]);

  it("atomically replaces the tree for content.write holders", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const [{ n }] = (await q<{ n: number }>("select public.replace_menu_items($1, $2::jsonb) as n", [MAIN_MENU, items])) as [{ n: number }];
      expect(n).toBe(3);
      const rows = await q<{ title: string; parent: string | null; position: number }>(
        `select i.title, p.title as parent, i.position from public.menu_items i left join public.menu_items p on p.id = i.parent_id
         where i.menu_id = $1 order by i.parent_id nulls first, i.position`,
        [MAIN_MENU],
      );
      expect(rows).toEqual([
        { title: "Home", parent: null, position: 0 },
        { title: "Shop", parent: null, position: 1 },
        { title: "Kurtas", parent: "Shop", position: 0 },
      ]);
    });
  });

  it("rolls back everything when an item is invalid", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const bad = JSON.stringify([{ title: "Ok", link_type: "home" }, { title: "Evil", link_type: "url", url: "javascript:alert(1)" }]);
      await rejects(q("select public.replace_menu_items($1, $2::jsonb)", [MAIN_MENU, bad]), /menu_items_url_check|check constraint/);
      const rows = await q("select 1 from public.menu_items where menu_id = $1", [MAIN_MENU]);
      expect(rows.length).toBe(6); // seed items untouched
    });
  });

  it("denies staff (no content.write) and other tenants", async () => {
    await as(user(USERS.aanganStaff), (q) => rejects(q("select public.replace_menu_items($1, $2::jsonb)", [MAIN_MENU, items]), /not allowed/));
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select public.replace_menu_items($1, $2::jsonb)", [MAIN_MENU, items]), /not allowed/));
  });
});

// ---------------------------------------------------------------------------------------------
// 0951: reports, invoices, discount save
// ---------------------------------------------------------------------------------------------

type Q = Parameters<Parameters<typeof as>[1]>[0];
const OWNER_CLAIMS = JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" });

/** Seeds orders as the superuser, then continues the SAME transaction as the Aangan owner. */
async function withOrders<T>(fn: (q: Q, ids: { cod: string; pending: string; cancelled: string }) => Promise<T>, claims = OWNER_CLAIMS): Promise<T> {
  return as(superuser, async (q) => {
    const [v] = await q<{ id: string }>("select id from product_variants where product_id = $1 and option1 = 'M'", [PRODUCTS.aanganKurta]);
    const place = async (method: "cod" | "online", placedAt: string) => {
      const order = {
        tenant_id: TENANTS.aangan,
        idempotency_key: `dash-${Math.random()}`,
        email: "buyer@example.test",
        phone: "+919811112222",
        payment_method: method,
        subtotal: 1499,
        discount_total: 0,
        shipping_total: 0,
        cod_fee: 0,
        tax_total: 71.38,
        grand_total: 1499,
        prices_include_tax: true,
        shipping_address: { name: "Buyer", line1: "1 MG Road", city: "Jaipur", state: "Rajasthan", postal_code: "302001", phone: "+919811112222" },
        customer_snapshot: {},
      };
      const items = [{ variant_id: v!.id, quantity: 1, unit_price: 1499, discount_total: 0, tax_rate: 5, tax_total: 71.38 }];
      const { svc_place_order: id } = one(await q<{ svc_place_order: string }>("select public.svc_place_order($1, $2)", [order, JSON.stringify(items)]));
      await q("update orders set placed_at = $2 where id = $1", [id, placedAt]);
      return id;
    };
    // 2026-09-23 20:00 UTC = 2026-09-24 01:30 IST → buckets on the IST day 2026-09-24
    const cod = await place("cod", "2026-09-23T20:00:00Z");
    const pending = await place("online", "2026-09-23T21:00:00Z");
    const cancelled = await place("cod", "2026-09-22T10:00:00Z");
    await q("select public.svc_cancel_order($1, 'test')", [cancelled]);
    await q("insert into analytics_events (tenant_id, session_id, event_name, path) values ($1,'s1','page_view','/?utm=x'),($1,'s1','page_view','/'),($1,'s2','page_view','/products/a'),($1,'s1','product_view',null),($1,null,'add_to_cart',null)", [TENANTS.aangan]);
    await q("select set_config('request.jwt.claims', $1, true)", [claims]);
    await q("set local role authenticated");
    return fn(q, { cod, pending, cancelled });
  });
}

describe("dashboard reports", () => {
  const from = "2026-09-01T00:00:00+05:30";
  const to = "2026-10-01T00:00:00+05:30";

  it("sales per IST day exclude cancelled and unpaid online orders", async () => {
    await withOrders(async (q) => {
      const rows = await q<{ day: string; orders: number; revenue: string }>("select day::text as day, orders, revenue from public.dashboard_sales_daily($1, $2, $3)", [TENANTS.aangan, from, to]);
      expect(rows.map((r) => [r.day, r.orders, r.revenue])).toEqual([["2026-09-24", 1, "1499.00"]]);
      const top = await q<{ title: string; units: number; revenue: string }>("select * from public.dashboard_top_products($1, $2, $3, 5)", [TENANTS.aangan, from, to]);
      expect(top).toMatchObject([{ title: "Indigo Dabu Straight Kurta", units: 1, revenue: "1499.00" }]);
    });
  });

  it("funnel counts distinct sessions and top pages strip query strings", async () => {
    await withOrders(async (q) => {
      const funnel = await q<{ event_name: string; sessions: number; events: number }>("select * from public.dashboard_funnel($1, now() - interval '1 hour', now() + interval '1 hour') order by event_name", [TENANTS.aangan]);
      expect(funnel).toEqual([
        { event_name: "add_to_cart", sessions: 1, events: 1 },
        { event_name: "page_view", sessions: 2, events: 3 },
        { event_name: "product_view", sessions: 1, events: 1 },
      ]);
      const pages = await q("select * from public.dashboard_top_pages($1, now() - interval '1 hour', now() + interval '1 hour', 10)", [TENANTS.aangan]);
      expect(pages).toEqual([
        { path: "/", views: 2, sessions: 1 },
        { path: "/products/a", views: 1, sessions: 1 },
      ]);
    });
  });

  it("reports are denied to other tenants and anon", async () => {
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select * from public.dashboard_sales_daily($1, now() - interval '1 day', now())", [TENANTS.aangan]), /not allowed/));
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select * from public.dashboard_funnel($1, now() - interval '1 day', now())", [TENANTS.aangan]), /not allowed/));
    await as(anon, (q) => rejects(q("select * from public.dashboard_top_products($1, now() - interval '1 day', now(), 5)", [TENANTS.aangan]), /permission denied/));
  });
});

describe("issue_order_invoice", () => {
  it("issues once per confirmed order and audits", async () => {
    await withOrders(async (q, ids) => {
      const a = one(await q<{ id: string }>("select public.issue_order_invoice($1) as id", [ids.cod]));
      const b = one(await q<{ id: string }>("select public.issue_order_invoice($1) as id", [ids.cod]));
      expect(b.id).toBe(a.id);
      const [inv] = await q<{ invoice_number: string }>("select invoice_number from invoices where order_id = $1", [ids.cod]);
      expect(inv!.invoice_number).toMatch(/^INV-\d{4}-\d{6}$/);
      const audits = await q("select 1 from audit_logs where action = 'invoice.issued' and entity_id = $1", [ids.cod]);
      expect(audits.length).toBe(1);
    });
  });

  it("refuses unpaid/cancelled orders, staff without access and other tenants", async () => {
    await withOrders(async (q, ids) => {
      await rejects(q("select public.issue_order_invoice($1)", [ids.pending]), /only confirmed orders/);
      await rejects(q("select public.issue_order_invoice($1)", [ids.cancelled]), /only confirmed orders/);
    });
    await withOrders((q, ids) => rejects(q("select public.issue_order_invoice($1)", [ids.cod]), /not allowed/), JSON.stringify({ sub: USERS.rangrezOwner, role: "authenticated" }));
  });
});

describe("save_discount", () => {
  const payload = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ code: "FESTIVE15", title: "Festive", type: "percentage", value: 15, applies_to: "products", min_subtotal: 999, max_discount: 500, automatic: false, status: "active", ...over });

  it("creates and updates the discount with its targets atomically", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const { id } = one(await q<{ id: string }>("select public.save_discount($1, null, $2::jsonb, $3::uuid[], null) as id", [TENANTS.aangan, payload(), [PRODUCTS.aanganKurta]]));
      expect(await q("select product_id from discount_products where discount_id = $1", [id])).toEqual([{ product_id: PRODUCTS.aanganKurta }]);
      await q("select public.save_discount($1, $2, $3::jsonb, null, $4::uuid[])", [TENANTS.aangan, id, payload({ applies_to: "collections", status: "disabled" }), ["33000000-0000-4000-a000-000000000001"]]);
      expect(await q("select 1 from discount_products where discount_id = $1", [id])).toEqual([]);
      expect(await q("select collection_id from discount_collections where discount_id = $1", [id])).toEqual([{ collection_id: "33000000-0000-4000-a000-000000000001" }]);
      expect(await q("select status, applies_to from discounts where id = $1", [id])).toEqual([{ status: "disabled", applies_to: "collections" }]);
    });
  });

  it("rejects another tenant's product and rolls back", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      await rejects(q("select public.save_discount($1, null, $2::jsonb, $3::uuid[], null)", [TENANTS.aangan, payload({ code: "XTENANT" }), [PRODUCTS.rangrezDress]]), /foreign key/);
      expect(await q("select 1 from discounts where code = 'XTENANT'")).toEqual([]);
    });
  });

  it("denies staff (no marketing.write) and cross-tenant updates", async () => {
    await as(user(USERS.aanganStaff), (q) => rejects(q("select public.save_discount($1, null, $2::jsonb, null, null)", [TENANTS.aangan, payload()]), /not allowed/));
    const id = await as(superuser, async (q) => one(await q<{ id: string }>("select id from discounts where code = 'WELCOME10'")).id);
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select public.save_discount($1, $2, $3::jsonb, null, null)", [TENANTS.aangan, id, payload()]), /not allowed/));
    await as(user(USERS.rangrezOwner), (q) => rejects(q("select public.save_discount($1, $2, $3::jsonb, null, null)", [TENANTS.rangrez, id, payload()]), /discount not found/));
  });
});
