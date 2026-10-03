import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, one, rejects, superuser, user } from "./db";

afterAll(closePool);

const admin = user(USERS.platformAdmin);
const aOwner = user(USERS.aanganOwner);
const rOwner = user(USERS.rangrezOwner);

describe("platform read helpers", () => {
  it("overview is platform-only", async () => {
    const row = one(await as(admin, (q) => q<{ v: Record<string, unknown> }>("select public.platform_overview() as v")));
    expect(row.v).toHaveProperty("status_counts");
    expect(row.v).toHaveProperty("month_gmv");
    await rejects(as(aOwner, (q) => q("select public.platform_overview()")), /not allowed/);
    await rejects(as(anon, (q) => q("select public.platform_overview()")), /permission denied/);
  });

  it("tenant counts, storage usage and user lookup require platform permissions", async () => {
    const counts = one(await as(admin, (q) => q<{ v: Record<string, number> }>("select public.platform_tenant_counts($1) as v", [TENANTS.aangan])));
    expect(counts.v.products).toBeGreaterThan(0);
    await rejects(as(aOwner, (q) => q("select public.platform_tenant_counts($1)", [TENANTS.aangan])), /not allowed/);
    await as(admin, (q) => q("select * from public.platform_storage_usage(null, 10)"));
    await rejects(as(aOwner, (q) => q("select * from public.platform_storage_usage(null, 10)")), /not allowed/);

    const found = one(await as(admin, (q) => q<{ v: string }>("select public.platform_find_user_by_email(' OWNER@aangan.test ') as v")));
    expect(found.v).toBe(USERS.aanganOwner);
    await rejects(as(aOwner, (q) => q("select public.platform_find_user_by_email('owner@rangrez.test')")), /not allowed/);

    const emails = await as(admin, (q) => q<{ email: string }>("select email from public.platform_user_emails($1::uuid[])", [[USERS.aanganOwner, USERS.rangrezOwner]]));
    expect(emails.map((e) => e.email).sort()).toEqual(["owner@aangan.test", "owner@rangrez.test"]);
    await rejects(as(aOwner, (q) => q("select * from public.platform_user_emails($1::uuid[])", [[USERS.rangrezOwner]])), /not allowed/);
  });

  it("tenant list stats return owner and counts for a page of tenants, platform staff only", async () => {
    const rows = await as(admin, (q) =>
      q<{ tenant_id: string; owner_email: string; products: string }>("select * from public.platform_tenant_list_stats($1::uuid[])", [[TENANTS.aangan, TENANTS.rangrez]]),
    );
    const byId = new Map(rows.map((r) => [r.tenant_id, r]));
    expect(byId.get(TENANTS.aangan)?.owner_email).toBe("owner@aangan.test");
    expect(byId.get(TENANTS.rangrez)?.owner_email).toBe("owner@rangrez.test");
    expect(Number(byId.get(TENANTS.aangan)?.products)).toBeGreaterThan(0);
    await rejects(as(aOwner, (q) => q("select * from public.platform_tenant_list_stats($1::uuid[])", [[TENANTS.rangrez]])), /not allowed/);
    await rejects(as(anon, (q) => q("select * from public.platform_tenant_list_stats($1::uuid[])", [[TENANTS.rangrez]])), /permission denied/);
  });
});

describe("tenant_entitlements", () => {
  it("members can read entitlements even when their plan is inactive (retired)", async () => {
    await as(superuser, async (q) => {
      await q("update plans set active = false where id = (select plan_id from tenants where id = $1)", [TENANTS.aangan]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      const row = one(await q<{ v: { plan: { code: string }; defaults: Record<string, boolean> } }>("select public.tenant_entitlements($1) as v", [TENANTS.aangan]));
      expect(row.v.plan.code).toBe("growth");
      expect(row.v.defaults).toHaveProperty("custom_domains");
    });
  });

  it("platform staff can read; other tenants cannot", async () => {
    await as(admin, (q) => q("select public.tenant_entitlements($1)", [TENANTS.aangan]));
    await rejects(as(rOwner, (q) => q("select public.tenant_entitlements($1)", [TENANTS.aangan])), /not allowed/);
  });
});

describe("platform_create_tenant", () => {
  it("creates tenant, store, subdomain, owner membership and a platform audit row atomically", async () => {
    await as(admin, async (q) => {
      const id = one(await q<{ id: string }>("select public.platform_create_tenant($1, 'Kesar Looms', 'kesar', 'localhost') as id", [USERS.shopper])).id;
      const t = one(await q<{ status: string; created_by: string }>("select status, created_by from tenants where id = $1", [id]));
      expect(t.status).toBe("trial");
      expect(t.created_by).toBe(USERS.platformAdmin);
      const d = one(await q<{ hostname: string; is_primary: boolean }>("select hostname, is_primary from domains where tenant_id = $1", [id]));
      expect(d).toEqual({ hostname: "kesar.localhost", is_primary: true });
      const m = one(await q<{ user_id: string; role: string }>("select user_id, role from tenant_memberships where tenant_id = $1", [id]));
      expect(m).toEqual({ user_id: USERS.shopper, role: "owner" });
      const a = one(await q<{ actor_type: string }>("select actor_type from audit_logs where tenant_id = $1 and action = 'tenant.created'", [id]));
      expect(a.actor_type).toBe("platform");
    });
  });

  it("is denied to sellers and rejects unknown users / bad status", async () => {
    await rejects(as(aOwner, (q) => q("select public.platform_create_tenant($1, 'X Store', 'xstore', 'localhost')", [USERS.aanganOwner])), /not allowed/);
    await rejects(as(admin, (q) => q("select public.platform_create_tenant('00000000-0000-4000-a000-0000000000ff', 'X Store', 'xstore', 'localhost')")), /user not found/);
    await rejects(as(admin, (q) => q("select public.platform_create_tenant($1, 'X Store', 'xstore', 'localhost', null, 'suspended')", [USERS.shopper])), /initial status/);
  });
});

describe("last super_admin guard", () => {
  it("cannot disable, demote or delete the only super_admin", async () => {
    await rejects(as(admin, (q) => q("update platform_memberships set status = 'disabled' where user_id = $1", [USERS.platformAdmin])), /last active super_admin/);
    await rejects(as(admin, (q) => q("update platform_memberships set role = 'support' where user_id = $1", [USERS.platformAdmin])), /last active super_admin/);
    await rejects(as(admin, (q) => q("delete from platform_memberships where user_id = $1", [USERS.platformAdmin])), /last active super_admin/);
  });

  it("allows it once another active super_admin exists", async () => {
    await as(superuser, async (q) => {
      await q("insert into platform_memberships (user_id, role) values ($1, 'super_admin')", [USERS.shopper]);
      const rows = await q("update platform_memberships set status = 'disabled' where user_id = $1 returning user_id", [USERS.platformAdmin]);
      expect(rows).toHaveLength(1);
    });
  });
});

describe("domains: primary + removal", () => {
  const insertCustom = `insert into domains (tenant_id, hostname, type, status, verified_at, ssl_status)
    values ($1, $2, 'custom', $3, case when $3 = 'verified' then now() end, 'pending') returning id`;

  it("sellers can never mark a domain verified themselves", async () => {
    await rejects(
      as(aOwner, (q) => q("insert into domains (tenant_id, hostname, type, status) values ($1, 'shop.aangan.in', 'custom', 'verified')", [TENANTS.aangan])),
      /row-level security/,
    );
    await as(aOwner, async (q) => {
      const id = one(await q<{ id: string }>("insert into domains (tenant_id, hostname, type) values ($1, 'shop.aangan.in', 'custom') returning id", [TENANTS.aangan])).id;
      const upd = await q("update domains set status = 'verified' where id = $1 returning id", [id]);
      expect(upd).toHaveLength(0); // no UPDATE policy for authenticated
    });
  });

  it("swaps the primary atomically and only to verified domains of the caller's tenant", async () => {
    await as(superuser, async (q) => {
      const verified = one(await q<{ id: string }>(insertCustom, [TENANTS.aangan, "www.aangan.in", "verified"])).id;
      const pending = one(await q<{ id: string }>(insertCustom, [TENANTS.aangan, "shop.aangan.in", "pending"])).id;
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      await rejects(q("select public.set_primary_domain($1)", [pending]), /only verified/);
      await q("select public.set_primary_domain($1)", [verified]);
      const primaries = await q<{ hostname: string }>("select hostname from domains where tenant_id = $1 and is_primary", [TENANTS.aangan]);
      expect(primaries).toEqual([{ hostname: "www.aangan.in" }]);

      // Removing the primary custom domain falls back to the platform subdomain.
      const removed = one(await q<{ hostname: string }>("select * from public.remove_custom_domain($1)", [verified]));
      expect(removed.hostname).toBe("www.aangan.in");
      const after = await q<{ hostname: string }>("select hostname from domains where tenant_id = $1 and is_primary", [TENANTS.aangan]);
      expect(after).toEqual([{ hostname: "aangan.localhost" }]);
    });
  });

  it("other tenants and staff without domains.manage are refused", async () => {
    await as(superuser, async (q) => {
      const id = one(await q<{ id: string }>(insertCustom, [TENANTS.aangan, "www.aangan.in", "verified"])).id;
      for (const [who, claims] of [
        ["rangrez owner", USERS.rangrezOwner],
        ["aangan staff", USERS.aanganStaff],
      ] as const) {
        await q("reset role");
        await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: claims, role: "authenticated" })]);
        await q("set local role authenticated");
        await rejects(q("select public.set_primary_domain($1)", [id]), /domain not found/).catch((e) => {
          throw new Error(`${who}: ${(e as Error).message}`);
        });
        await rejects(q("select * from public.remove_custom_domain($1)", [id]), /domain not found/);
      }
    });
  });

  it("the platform subdomain cannot be removed", async () => {
    await as(aOwner, async (q) => {
      const sub = one(await q<{ id: string }>("select id from domains where hostname = 'aangan.localhost'")).id;
      await rejects(q("select * from public.remove_custom_domain($1)", [sub]), /platform subdomain/);
    });
  });
});
