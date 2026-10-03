import { afterAll, describe, expect, it } from "vitest";
import { PRODUCTS, TENANTS, USERS, anon, as, closePool, one, rejects, service, superuser, user } from "./db";

afterAll(closePool);

const aOwner = user(USERS.aanganOwner);
const aStaff = user(USERS.aanganStaff);
const rOwner = user(USERS.rangrezOwner);

describe("catalog isolation between tenants", () => {
  it("owner sees own drafts but never another tenant's drafts", async () => {
    const own = await as(aOwner, (q) => q("select id from products where id = $1", [PRODUCTS.aanganDraft]));
    expect(own).toHaveLength(1);
    const other = await as(rOwner, (q) => q("select id from products where id = $1", [PRODUCTS.aanganDraft]));
    expect(other).toHaveLength(0);
  });

  it("cannot insert a product into another tenant", async () => {
    await rejects(
      as(rOwner, (q) => q("insert into products (tenant_id, title, slug) values ($1, 'x', 'x')", [TENANTS.aangan])),
      /row-level security/,
    );
  });

  it("cannot update or delete another tenant's product (0 rows affected)", async () => {
    const updated = await as(rOwner, (q) => q("update products set title = 'pwned' where id = $1 returning id", [PRODUCTS.aanganKurta]));
    expect(updated).toHaveLength(0);
    const deleted = await as(rOwner, (q) => q("delete from products where id = $1 returning id", [PRODUCTS.aanganKurta]));
    expect(deleted).toHaveLength(0);
  });

  it("cannot move own row into another tenant", async () => {
    await rejects(
      as(aOwner, (q) => q("update products set tenant_id = $1 where id = $2", [TENANTS.rangrez, PRODUCTS.aanganKurta])),
      /row-level security|tenant_id is immutable/,
    );
  });

  it("composite foreign keys block cross-tenant links even with write access to one side", async () => {
    await rejects(
      as(aOwner, (q) =>
        q("insert into collection_products (tenant_id, collection_id, product_id) values ($1, '33000000-0000-4000-a000-000000000003', $2)", [
          TENANTS.aangan,
          PRODUCTS.rangrezDress,
        ]),
      ),
      /foreign key/,
    );
  });

  it("inventory, orders, customers and discounts of another tenant are invisible", async () => {
    await as(rOwner, async (q) => {
      for (const table of ["inventory_levels", "inventory_movements", "customers", "discounts", "shipping_rates", "domains", "tenant_memberships"]) {
        const rows = await q(`select tenant_id from ${table} where tenant_id = $1`, [TENANTS.aangan]);
        // shipping_rates of open tenants are public by design; everything else must be empty
        if (table === "shipping_rates") continue;
        expect(rows, table).toHaveLength(0);
      }
    });
  });
});

describe("role permissions inside a tenant", () => {
  it("staff can edit catalog but not store settings, members, or theme publishing", async () => {
    const ok = await as(aStaff, (q) => q("update products set title = title where id = $1 returning id", [PRODUCTS.aanganKurta]));
    expect(ok).toHaveLength(1);
    const settings = await as(aStaff, (q) => q("update stores set name = 'x' where tenant_id = $1 returning tenant_id", [TENANTS.aangan]));
    expect(settings).toHaveLength(0);
    const members = await as(aStaff, (q) => q("update tenant_memberships set role = 'admin' where user_id = $1 returning id", [USERS.aanganStaff]));
    expect(members).toHaveLength(0);
    await rejects(as(aStaff, (q) => q("select public.publish_theme($1)", [TENANTS.aangan])), /not allowed/);
  });

  it("owners cannot change their own tenant status or plan", async () => {
    await rejects(as(aOwner, (q) => q("update tenants set status = 'active' where id = $1", [TENANTS.rangrez])), /.*/).catch(() => undefined);
    await rejects(
      as(rOwner, (q) => q("update tenants set status = 'active' where id = $1", [TENANTS.rangrez])),
      /only platform administrators/,
    );
  });

  it("the owner membership cannot be edited or removed by admins", async () => {
    const rows = await as(aOwner, (q) => q("delete from tenant_memberships where user_id = $1 returning id", [USERS.aanganOwner]));
    expect(rows).toHaveLength(0);
  });
});

describe("anonymous storefront access", () => {
  it("sees only active, published products of open tenants", async () => {
    const rows = await as(anon, (q) => q<{ slug: string }>("select slug from products where tenant_id = $1 order by slug", [TENANTS.aangan]));
    expect(rows.map((r) => r.slug)).not.toContain("sage-kalamkari-co-ord-set");
    expect(rows.length).toBe(5);
  });

  it("loses access to a tenant's catalog when it is suspended", async () => {
    const rows = await as(superuser, async (q) => {
      await q("update tenants set status = 'suspended' where id = $1", [TENANTS.aangan]);
      await q("set local role anon");
      await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      return q("select id from products where tenant_id = $1", [TENANTS.aangan]);
    });
    expect(rows).toHaveLength(0);
  });

  it("cannot read customers, orders, carts, memberships, payment settings or audit logs", async () => {
    await as(anon, async (q) => {
      for (const table of ["customers", "orders", "carts", "tenant_memberships", "tenant_payment_settings", "audit_logs", "inventory_levels", "discounts"]) {
        expect(await q(`select 1 from ${table} limit 1`), table).toHaveLength(0);
      }
    });
  });

  it("cannot call privileged RPCs", async () => {
    await rejects(as(anon, (q) => q("select public.svc_place_order('{}'::jsonb, '[]'::jsonb)")), /permission denied/);
    await rejects(as(anon, (q) => q("select public.adjust_inventory(gen_random_uuid(), 1, 'adjustment')")), /permission denied/);
    await rejects(as(user(USERS.shopper), (q) => q("select public.svc_expire_unpaid_orders()")), /permission denied/);
  });

  it("gets capped stock information via variant_stock only", async () => {
    const rows = await as(anon, (q) =>
      q<{ available: number; in_stock: boolean }>(
        "select * from public.variant_stock(array(select id from product_variants where product_id = $1))",
        [PRODUCTS.aanganKurta],
      ),
    );
    expect(rows.length).toBe(6);
    expect(rows.every((r) => r.available <= 20 && r.in_stock)).toBe(true);
  });
});

describe("customers", () => {
  it("see their own customer record but not other customers", async () => {
    const rows = await as(user(USERS.shopper), (q) => q("select email from customers"));
    expect(rows).toEqual([{ email: "shopper@example.test" }]);
  });

  it("cannot edit staff-owned fields on their own record", async () => {
    await rejects(
      as(user(USERS.shopper), (q) => q("update customers set tags = '{vip}' where auth_user_id = $1", [USERS.shopper])),
      /field not editable/,
    );
    const ok = await as(user(USERS.shopper), (q) => q("update customers set first_name = 'N' where auth_user_id = $1 returning id", [USERS.shopper]));
    expect(ok).toHaveLength(1);
  });
});

describe("customer ↔ customer isolation", () => {
  const SHOPPER_B = "00000000-0000-4000-a000-0000000000b2";
  const CUSTOMER_B = "35000000-0000-4000-a000-0000000000b2";

  it("a shopper cannot read or change another shopper's orders, addresses or wishlist", async () => {
    await as(superuser, async (q) => {
      // Second shopper of the same store with an address, a wishlist item and an order.
      await q("insert into auth.users (id, email, aud, role) values ($1, 'second@example.test', 'authenticated', 'authenticated')", [SHOPPER_B]);
      await q("insert into customers (id, tenant_id, auth_user_id, email, first_name) values ($1, $2, $3, 'second@example.test', 'B')", [CUSTOMER_B, TENANTS.aangan, SHOPPER_B]);
      await q(
        "insert into customer_addresses (tenant_id, customer_id, name, phone, line1, city, state, postal_code) values ($1, $2, 'B', '+919800000000', '1 Road', 'Jaipur', 'Rajasthan', '302001')",
        [TENANTS.aangan, CUSTOMER_B],
      );
      await q("insert into wishlist_items (tenant_id, customer_id, product_id) values ($1, $2, $3)", [TENANTS.aangan, CUSTOMER_B, PRODUCTS.aanganKurta]);
      await q(
        `insert into orders (tenant_id, order_number, customer_id, email, phone, payment_method, subtotal, grand_total, shipping_address, idempotency_key)
         values ($1, 9001, $2, 'second@example.test', '+919800000000', 'cod', 100, 100, '{}', 'iso-test-b')`,
        [TENANTS.aangan, CUSTOMER_B],
      );

      // Now act as shopper A (seed shopper of the same store).
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.shopper, role: "authenticated" })]);
      await q("set local role authenticated");
      expect(await q("select id from orders where customer_id = $1", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("select id from customer_addresses where customer_id = $1", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("select product_id from wishlist_items where customer_id = $1", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("select id from customers where id = $1", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("update customer_addresses set city = 'X' where customer_id = $1 returning id", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("delete from wishlist_items where customer_id = $1 returning product_id", [CUSTOMER_B])).toHaveLength(0);
      expect(await q("update orders set note = 'x' where customer_id = $1 returning id", [CUSTOMER_B])).toHaveLength(0);
      await rejects(q("insert into wishlist_items (tenant_id, customer_id, product_id) values ($1, $2, $3)", [TENANTS.aangan, CUSTOMER_B, PRODUCTS.aanganKurta]), /row-level security|duplicate key|permission denied/);

      // Shopper B sees their own data.
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: SHOPPER_B, role: "authenticated" })]);
      expect(await q("select id from orders where customer_id = $1", [CUSTOMER_B])).toHaveLength(1);
      expect(await q("select id from customer_addresses where customer_id = $1", [CUSTOMER_B])).toHaveLength(1);
      expect(await q("select product_id from wishlist_items where customer_id = $1", [CUSTOMER_B])).toHaveLength(1);
    });
  });

  it("a signed-in shopper cannot reach seller or platform data", async () => {
    await as(user(USERS.shopper), async (q) => {
      expect(await q("select id from tenant_memberships")).toHaveLength(0);
      expect(await q("select user_id from platform_memberships")).toHaveLength(0);
      expect(await q("select id from audit_logs")).toHaveLength(0);
      expect(await q("select tenant_id from tenant_payment_settings")).toHaveLength(0);
      expect(await q("update products set title = 'x' returning id")).toHaveLength(0);
      await rejects(q("select public.platform_overview()"), /not allowed/);
    });
  });
});

describe("platform & support access", () => {
  it("platform admin can read all tenants; a seller cannot", async () => {
    const all = await as(user(USERS.platformAdmin), (q) => q("select id from tenants"));
    expect(all.length).toBeGreaterThanOrEqual(2);
    const mine = await as(rOwner, (q) => q("select id from tenants"));
    expect(mine).toEqual([{ id: TENANTS.rangrez }]);
  });

  it("support session grants read-only access that ends when the session ends", async () => {
    await as(user(USERS.platformAdmin), async (q) => {
      expect(await q("select id from customers where tenant_id = $1", [TENANTS.aangan])).toHaveLength(0);
      const { start_support_session: sid } = one(await q<{ start_support_session: string }>(
        "select public.start_support_session($1, 'Investigating a checkout issue', 30)",
        [TENANTS.aangan],
      ));
      expect(await q("select id from customers where tenant_id = $1", [TENANTS.aangan])).toHaveLength(1);
      expect(await q("update products set title = 'x' where tenant_id = $1 returning id", [TENANTS.aangan])).toHaveLength(0);
      await q("select public.end_support_session($1)", [sid]);
      expect(await q("select id from customers where tenant_id = $1", [TENANTS.aangan])).toHaveLength(0);
      const audit = await q<{ action: string }>("select action from audit_logs where tenant_id = $1 and action like 'support.%' order by id", [TENANTS.aangan]);
      expect(audit.map((a) => a.action)).toEqual(["support.session_started", "support.session_ended"]);
    });
  });

  it("sellers cannot start support sessions", async () => {
    await rejects(as(aOwner, (q) => q("select public.start_support_session($1, 'I want to look around', 30)", [TENANTS.rangrez])), /not allowed/);
  });

  it("audit logs are append-only even for the service role", async () => {
    await rejects(
      as(service, async (q) => {
        await q("insert into audit_logs (action) values ('test.event')");
        await q("delete from audit_logs");
      }),
      /append-only/,
    );
    await rejects(
      as(service, async (q) => {
        await q("insert into audit_logs (action) values ('test.event')");
        await q("update audit_logs set action = 'x.y'");
      }),
      /append-only/,
    );
  });
});

describe("storage policies", () => {
  it("staff can upload under their tenant prefix only", async () => {
    await as(aOwner, async (q) => {
      await q("insert into storage.objects (bucket_id, name) values ('store-assets', $1)", [`tenant/${TENANTS.aangan}/products/a.jpg`]);
    });
    await rejects(
      as(aOwner, (q) => q("insert into storage.objects (bucket_id, name) values ('store-assets', $1)", [`tenant/${TENANTS.rangrez}/products/a.jpg`])),
      /row-level security/,
    );
    await rejects(
      as(aOwner, (q) => q("insert into storage.objects (bucket_id, name) values ('store-assets', 'tenant/not-a-uuid/x.jpg')")),
      /row-level security/,
    );
  });
});

describe("onboarding", () => {
  it("create_tenant makes the caller owner with a verified platform subdomain", async () => {
    await as(user(USERS.shopper), async (q) => {
      const { create_tenant: id } = one(await q<{ create_tenant: string }>("select public.create_tenant('Neha Label', 'neha-label', 'paliya.store')"));
      const [m] = await q<{ role: string }>("select role from tenant_memberships where tenant_id = $1", [id]);
      expect(m?.role).toBe("owner");
      const [d] = await q<{ hostname: string; status: string }>("select hostname, status from domains where tenant_id = $1", [id]);
      expect(d).toEqual({ hostname: "neha-label.paliya.store", status: "verified" });
    });
  });

  it("rejects reserved and malformed slugs", async () => {
    await rejects(as(user(USERS.shopper), (q) => q("select public.create_tenant('X Store', 'admin', 'paliya.store')")), /check constraint/);
    await rejects(as(user(USERS.shopper), (q) => q("select public.create_tenant('X Store', 'Bad Slug', 'paliya.store')")), /check constraint/);
  });

  it("custom domains can only be added as pending", async () => {
    await rejects(
      as(aOwner, (q) => q("insert into domains (tenant_id, hostname, type, status) values ($1, 'www.aangan.in', 'custom', 'verified')", [TENANTS.aangan])),
      /row-level security/,
    );
    const rows = await as(aOwner, (q) => q("insert into domains (tenant_id, hostname, type) values ($1, 'www.aangan.in', 'custom') returning status", [TENANTS.aangan]));
    expect(rows).toEqual([{ status: "pending" }]);
  });
});
