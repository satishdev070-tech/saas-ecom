import { afterAll, describe, expect, it } from "vitest";
import { PRODUCTS, TENANTS, USERS, as, closePool, one, rejects, superuser } from "./db";

afterAll(closePool);

const MEMBER = "00000000-0000-4000-a000-0000000000c1";
const OTHER = "00000000-0000-4000-a000-0000000000c2";

type Q = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Switches the current transaction to act as `userId` (authenticated). */
async function actAs(q: Q, userId: string) {
  await q("reset role");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await q("set local role authenticated");
}
async function asSuper(q: Q) {
  await q("reset role");
  await q("select set_config('request.jwt.claims', '', true)");
}
async function addMember(q: Q, userId: string, email: string, role: string, customRoleId: string | null = null) {
  await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated') on conflict do nothing", [userId, email]);
  await q("insert into tenant_memberships (tenant_id, user_id, role, custom_role_id) values ($1, $2, $3, $4)", [TENANTS.aangan, userId, role, customRoleId]);
}
const can = async (q: Q, perm: string) => one(await q<{ ok: boolean }>("select app.has_tenant_permission($1, $2) as ok", [TENANTS.aangan, perm])).ok;

describe("custom roles", () => {
  it("grant exactly the listed permissions, and are audited", async () => {
    await as(superuser, async (q) => {
      await actAs(q, USERS.aanganOwner);
      const role = one(await q<{ id: string }>("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Photo editor', '{catalog.read,catalog.write,store.read}') returning id", [TENANTS.aangan]));
      await asSuper(q);
      await addMember(q, MEMBER, "editor@aangan.test", "custom", role.id);
      await actAs(q, MEMBER);
      expect(await can(q, "catalog.write")).toBe(true);
      expect(await can(q, "catalog.delete")).toBe(false);
      expect(await can(q, "orders.read")).toBe(false);
      await asSuper(q);
      const audit = await q<{ action: string }>("select action from audit_logs where tenant_id = $1 and action = 'role.created'", [TENANTS.aangan]);
      expect(audit).toHaveLength(1);
    });
  });

  it("can never include owner-only billing", async () => {
    await as(superuser, (q) => rejects(q("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Bad', '{billing.manage}')", [TENANTS.aangan]), /check constraint/));
  });

  it("are invisible to other stores", async () => {
    await as(superuser, async (q) => {
      await q("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Secret', '{store.read}')", [TENANTS.aangan]);
      await actAs(q, USERS.rangrezOwner);
      expect(await q("select id from tenant_custom_roles where tenant_id = $1", [TENANTS.aangan])).toHaveLength(0);
      expect(await q("update tenant_custom_roles set name = 'x' where tenant_id = $1 returning id", [TENANTS.aangan])).toHaveLength(0);
    });
  });
});

describe("privilege escalation guards", () => {
  it("a team manager cannot create a role, or assign one, with permissions they lack", async () => {
    await as(superuser, async (q) => {
      // Member who can manage the team and roles, but not payments.
      const role = one(await q<{ id: string }>("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Team lead', '{store.read,members.read,members.manage,roles.manage,catalog.read}') returning id", [TENANTS.aangan]));
      await addMember(q, MEMBER, "lead@aangan.test", "custom", role.id);
      await addMember(q, OTHER, "other@aangan.test", "viewer");
      await actAs(q, MEMBER);
      await rejects(q("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Sneaky', '{payments.manage}')", [TENANTS.aangan]), /only grant permissions you hold/);
      await rejects(q("update tenant_memberships set role = 'admin' where user_id = $1 and tenant_id = $2", [OTHER, TENANTS.aangan]), /cannot assign a role/);
      await rejects(q("update tenant_memberships set role = 'admin', custom_role_id = null where user_id = $1 and tenant_id = $2", [MEMBER, TENANTS.aangan]), /cannot change your own role/);
      await rejects(q("insert into tenant_invitations (tenant_id, email, role, token_hash, expires_at, invited_by) values ($1, 'x@aangan.test', 'admin', 'h1', now() + interval '1 day', $2)", [TENANTS.aangan, MEMBER]), /cannot assign a role/);
      // Allowed: a custom role made only of permissions they hold, assigned to someone else.
      const small = one(await q<{ id: string }>("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Browser', '{store.read,catalog.read}') returning id", [TENANTS.aangan]));
      const ok = await q("update tenant_memberships set role = 'custom', custom_role_id = $3 where user_id = $1 and tenant_id = $2 returning id", [OTHER, TENANTS.aangan, small.id]);
      expect(ok).toHaveLength(1);
    });
  });

  it("the owner membership cannot be changed by admins", async () => {
    await as(superuser, async (q) => {
      await addMember(q, MEMBER, "admin2@aangan.test", "admin");
      await actAs(q, MEMBER);
      expect(await q("update tenant_memberships set role = 'viewer' where user_id = $1 returning id", [USERS.aanganOwner])).toHaveLength(0);
    });
  });
});

describe("finer permissions", () => {
  it("deleting and publishing products need their own permissions", async () => {
    await as(superuser, async (q) => {
      const role = one(await q<{ id: string }>("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Editor', '{store.read,catalog.read,catalog.write}') returning id", [TENANTS.aangan]));
      await addMember(q, MEMBER, "ed@aangan.test", "custom", role.id);
      await actAs(q, MEMBER);
      expect(await q("delete from products where id = $1 returning id", [PRODUCTS.aanganDraft])).toHaveLength(0);
      await rejects(q("update products set status = 'active' where id = $1", [PRODUCTS.aanganDraft]), /permission to publish/);
      expect(await q("update products set title = 'Renamed' where id = $1 returning id", [PRODUCTS.aanganDraft])).toHaveLength(1);
      await asSuper(q);
      await q("update tenant_memberships set role = 'catalog_manager', custom_role_id = null where user_id = $1", [MEMBER]);
      await actAs(q, MEMBER);
      expect(await q("update products set status = 'active' where id = $1 returning id", [PRODUCTS.aanganDraft])).toHaveLength(1);
    });
  });

  it("cancelling an order needs orders.cancel", async () => {
    await as(superuser, async (q) => {
      await addMember(q, MEMBER, "agent@aangan.test", "support_agent");
      const order = one(
        await q<{ id: string }>(
          `insert into orders (tenant_id, order_number, email, phone, payment_method, subtotal, grand_total, shipping_address, idempotency_key, status)
           values ($1, 9101, 'x@example.test', '+919800000000', 'cod', 100, 100, '{}', 'rbac-cancel', 'confirmed') returning id`,
          [TENANTS.aangan],
        ),
      );
      await actAs(q, MEMBER);
      expect(await can(q, "orders.write")).toBe(true);
      await rejects(q("select public.cancel_order($1, 'test')", [order.id]), /not allowed/);
    });
  });

  it("new system roles resolve to the matrix permissions", async () => {
    await as(superuser, async (q) => {
      await addMember(q, MEMBER, "analyst@aangan.test", "analyst");
      await actAs(q, MEMBER);
      expect(await can(q, "analytics.read")).toBe(true);
      expect(await can(q, "orders.write")).toBe(false);
      expect(await can(q, "members.read")).toBe(false);
    });
  });
});
