import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, rejects, service, superuser, user } from "./db";

afterAll(closePool);

const aPath = `tenant/${TENANTS.aangan}/media/11111111-1111-4111-a111-111111111111.webp`;
const bPath = `tenant/${TENANTS.rangrez}/media/22222222-2222-4222-a222-222222222222.webp`;

describe("tenant_integrations (secrets) are server-only", () => {
  it("no client role can read or write integration rows, even for its own store", async () => {
    await as(superuser, (q) => q("insert into tenant_integrations (tenant_id, kind, provider, public_config, secrets_encrypted, status) values ($1, 'payment', 'cashfree', '{\"app_id\":\"x\"}', 'cipher', 'connected')", [TENANTS.aangan]));
    for (const caller of [anon, user(USERS.aanganOwner), user(USERS.platformAdmin)]) {
      await as(caller, async (q) => {
        await rejects(q("select secrets_encrypted from tenant_integrations"), /permission denied/);
        await rejects(q("insert into tenant_integrations (tenant_id, kind, provider) values ($1, 'payment', 'payu')", [TENANTS.aangan]), /permission denied/);
      });
    }
    await as(service, async (q) => expect(await q("select 1 from tenant_integrations where tenant_id = $1", [TENANTS.aangan])).toBeDefined());
    await as(superuser, (q) => q("delete from tenant_integrations where tenant_id = $1 and provider = 'cashfree'", [TENANTS.aangan]));
  });

  it("rejects unknown providers and statuses", async () => {
    await as(superuser, async (q) => {
      await rejects(q("insert into tenant_integrations (tenant_id, kind, provider) values ($1, 'payment', 'stripe')", [TENANTS.aangan]), /check constraint/);
      await rejects(q("insert into tenant_integrations (tenant_id, kind, provider, status) values ($1, 'payment', 'payu', 'ok')", [TENANTS.aangan]), /check constraint/);
    });
  });
});

describe("social posts and creatives", () => {
  it("are isolated per store and media must belong to the store", async () => {
    await as(superuser, async (q) => {
      await q("insert into social_posts (tenant_id, caption, platforms, media_paths) values ($1, 'A post', '{instagram}', $2), ($3, 'B post', '{facebook}', $4)", [TENANTS.aangan, [aPath], TENANTS.rangrez, [bPath]]);
      await rejects(q("insert into social_posts (tenant_id, caption, platforms, media_paths) values ($1, 'x', '{instagram}', $2)", [TENANTS.aangan, [bPath]]), /check constraint/);
      await rejects(q("insert into social_posts (tenant_id, caption, platforms) values ($1, 'x', '{tiktok}')", [TENANTS.aangan]), /check constraint/);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      const rows = await q<{ caption: string }>("select caption from social_posts");
      expect(rows.map((r) => r.caption)).toEqual(["A post"]);
      expect(await q("update social_posts set caption = 'hijack' where tenant_id = $1 returning id", [TENANTS.rangrez])).toHaveLength(0);
      await rejects(q("insert into social_posts (tenant_id, caption, platforms) values ($1, 'x', '{instagram}')", [TENANTS.rangrez]), /row-level security/);
      await rejects(q("insert into creatives (tenant_id, template_key, template_version, name, output_path) values ($1, 'sale', 1, 'x', $2)", [TENANTS.aangan, bPath]), /check constraint|violates/);
    });
  });

  it("shoppers cannot see marketing data", async () => {
    await as(superuser, (q) => q("insert into social_posts (tenant_id, caption, platforms) values ($1, 'Secret launch', '{instagram}')", [TENANTS.aangan]).then(async () => {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.shopper, role: "authenticated" })]);
      await q("set local role authenticated");
      expect(await q("select 1 from social_posts")).toHaveLength(0);
    }));
  });
});

describe("platform_list_stores", () => {
  it("is refused to store owners, shoppers and anon", async () => {
    await as(user(USERS.aanganOwner), (q) => rejects(q("select * from platform_list_stores()"), /not allowed/));
    await as(user(USERS.shopper), (q) => rejects(q("select * from platform_list_stores()"), /not allowed/));
    await as(anon, (q) => rejects(q("select * from platform_list_stores()"), /permission denied/));
  });

  it("lists, searches, filters and paginates for platform admins", async () => {
    await as(user(USERS.platformAdmin), async (q) => {
      const all = await q<{ slug: string; total_count: string }>("select slug, total_count from platform_list_stores()");
      expect(all.map((r) => r.slug)).toEqual(expect.arrayContaining(["aangan", "rangrez"]));
      const byName = await q<{ slug: string }>("select slug from platform_list_stores(p_q => 'aang')");
      expect(byName.map((r) => r.slug)).toEqual(["aangan"]);
      const byId = await q<{ slug: string }>("select slug from platform_list_stores(p_q => $1)", [TENANTS.rangrez]);
      expect(byId.map((r) => r.slug)).toEqual(["rangrez"]);
      const page = await q<{ slug: string; total_count: string }>("select slug, total_count from platform_list_stores(p_limit => 1, p_offset => 0)");
      expect(page).toHaveLength(1);
      expect(Number(page[0]!.total_count)).toBeGreaterThanOrEqual(2);
      expect(await q("select 1 from platform_list_stores(p_status => 'suspended')")).toHaveLength(0);
    });
  });

  it("returns and filters by store type and category (1800)", async () => {
    await as(user(USERS.platformAdmin), async (q) => {
      // Seed rows are inserted after migrations, so they keep the default 'real'.
      const real = await q<{ slug: string; store_type: string; category_name: string | null }>("select slug, store_type, category_name from platform_list_stores(p_type => 'real')");
      expect(real.map((r) => r.slug)).toEqual(expect.arrayContaining(["aangan", "rangrez"]));
      expect(real.every((r) => r.store_type === "real")).toBe(true);
      expect(await q("select 1 from platform_list_stores(p_type => 'demo')")).toHaveLength(0);
      const cat = await q<{ id: string }>("select id from store_categories where slug = 'fashion'");
      expect(await q("select 1 from platform_list_stores(p_category => $1::uuid)", [cat[0]!.id])).toHaveLength(0);
    });
  });
});

describe("themes catalogue", () => {
  it("is readable by anyone signed in but writable only by the platform", async () => {
    await as(superuser, (q) => q("insert into themes (key, name, category, config) values ('t-test', 'Test', 'minimal', '{}')").then(async () => {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      expect(await q("select key from themes where key = 't-test'")).toHaveLength(1);
      await rejects(q("insert into themes (key, name, category, config) values ('evil', 'Evil', 'minimal', '{}')"), /row-level security/);
      expect(await q("update themes set name = 'x' where key = 't-test' returning key")).toHaveLength(0);
    }));
  });
});
