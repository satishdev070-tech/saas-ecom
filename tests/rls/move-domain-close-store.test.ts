import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, one, superuser, user } from "./db";

afterAll(closePool);

const A = TENANTS.aangan;
const R = TENANTS.rangrez;
const staff = user(USERS.aanganStaff);
const rOwner = user(USERS.rangrezOwner);

type Q = Parameters<Parameters<typeof as>[1]>[0];

/** aangan owner also owns rangrez (two stores, one seller), and aangan has a verified primary custom domain. */
async function setup(q: Q) {
  await q("insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing", [R, USERS.aanganOwner]);
  await q("update domains set is_primary = false where tenant_id = $1", [A]);
  const d = one(await q<{ id: string }>("insert into domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary) values ($1, 'thepaliya.com', 'custom', 'verified', now(), 'active', true) returning id", [A]));
  return d.id;
}

describe("move_custom_domain (migration 2600)", () => {
  it("moves a verified domain to the seller's other store: stays verified, becomes its primary, source falls back to its subdomain", async () => {
    await as(superuser, async (q) => {
      const id = await setup(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      const r = one(await q<{ source_tenant: string; target_tenant: string; hostname: string; made_primary: boolean; new_domain: string }>("select * from move_custom_domain($1, $2)", [id, R]));
      expect(r).toMatchObject({ source_tenant: A, target_tenant: R, hostname: "thepaliya.com", made_primary: true });
      await q("reset role");
      expect(one(await q<{ status: string }>("select status from domains where id = $1", [id])).status).toBe("removed");
      const moved = one(await q<{ tenant_id: string; status: string; is_primary: boolean; ssl_status: string }>("select tenant_id, status, is_primary, ssl_status from domains where id = $1", [r.new_domain]));
      expect(moved).toEqual({ tenant_id: R, status: "verified", is_primary: true, ssl_status: "active" });
      const prim = await q<{ tenant_id: string; hostname: string }>("select tenant_id, hostname from domains where is_primary and status <> 'removed' order by hostname");
      expect(prim).toEqual([{ tenant_id: A, hostname: "aangan.localhost" }, { tenant_id: R, hostname: "thepaliya.com" }]);
      const audits = await q<{ action: string }>("select action from audit_logs where entity_id = any($1) order by action", [[id, r.new_domain]]);
      expect(audits.map((a) => a.action)).toEqual(["domain.moved_in", "domain.moved_out"]);
    });
  });

  it("refuses when the caller doesn't manage BOTH stores", async () => {
    for (const [caller, label] of [[staff, "staff of the source"], [rOwner, "owner of the target only"]] as const) {
      await as(superuser, async (q) => {
        const id = await setup(q);
        await q("delete from tenant_memberships where tenant_id = $1 and user_id = $2", [R, USERS.aanganOwner]);
        const claims = caller.role === "authenticated" ? caller.userId : "";
        await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: claims, role: "authenticated" })]);
        await q("set local role authenticated");
        await expect(q("select * from move_custom_domain($1, $2)", [id, R]), label).rejects.toThrow(/not found|not allowed/);
      });
    }
  });

  it("never moves the platform subdomain", async () => {
    await as(superuser, async (q) => {
      await setup(q);
      const sub = one(await q<{ id: string }>("select id from domains where hostname = 'aangan.localhost'"));
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      await expect(q("select * from move_custom_domain($1, $2)", [sub.id, R])).rejects.toThrow(/platform subdomain/);
    });
  });
});

describe("close_own_store (migration 2600)", () => {
  it("owner closes a store after typing its address; data stays; refused while a custom domain remains", async () => {
    await as(superuser, async (q) => {
      const id = await setup(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      await expect(q("select close_own_store($1, 'aangan')", [A])).rejects.toThrow(/custom domain/);
      await q("select * from move_custom_domain($1, $2)", [id, R]);
      await expect(q("select close_own_store($1, 'wrong')", [A])).rejects.toThrow(/confirm/);
      await q("select close_own_store($1, ' Aangan ')", [A]);
      await q("reset role");
      expect(one(await q<{ status: string }>("select status from tenants where id = $1", [A])).status).toBe("cancelled");
      expect(Number(one(await q<{ n: string }>("select count(*) n from products where tenant_id = $1", [A])).n)).toBeGreaterThan(0);
    });
  });

  it("only the owner can close", async () => {
    await as(staff, async (q) => {
      await expect(q("select close_own_store($1, 'aangan')", [A])).rejects.toThrow(/only the store owner/);
    });
    await as(rOwner, async (q) => {
      await expect(q("select close_own_store($1, 'aangan')", [A])).rejects.toThrow(/only the store owner/);
    });
  });
});
