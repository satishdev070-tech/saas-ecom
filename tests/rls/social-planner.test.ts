import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, rejects, superuser, user } from "./db";

afterAll(closePool);

const ownerA = user(USERS.aanganOwner);
// Sequential: queries share one client and each runs in its own savepoint.
async function seed(q: (sql: string, params?: unknown[]) => Promise<unknown>) {
  await q("insert into social_campaigns (tenant_id, name) values ($1, 'A Diwali'), ($2, 'B Diwali')", [TENANTS.aangan, TENANTS.rangrez]);
  await q("insert into social_hashtag_sets (tenant_id, name, tags) values ($1, 'A tags', '{#a}'), ($2, 'B tags', '{#b}')", [TENANTS.aangan, TENANTS.rangrez]);
  await q("insert into marketing_dates (tenant_id, title, on_date) values ($1, 'A sale', '2026-11-01'), ($2, 'B sale', '2026-11-01')", [TENANTS.aangan, TENANTS.rangrez]);
}

describe("social planner tables are tenant-isolated", () => {
  it("another store can't read campaigns, hashtag sets or key dates", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      expect((await q<{ name: string }>("select name from social_campaigns")).map((r) => r.name)).toEqual(["A Diwali"]);
      expect((await q<{ name: string }>("select name from social_hashtag_sets")).map((r) => r.name)).toEqual(["A tags"]);
      expect((await q<{ title: string }>("select title from marketing_dates")).map((r) => r.title)).toEqual(["A sale"]);
    });
  });

  it("another store can't write them", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      for (const t of ["social_campaigns", "social_hashtag_sets"]) {
        expect(await q(`update ${t} set name = 'hijack' where tenant_id = $1 returning id`, [TENANTS.rangrez])).toHaveLength(0);
        expect(await q(`delete from ${t} where tenant_id = $1 returning id`, [TENANTS.rangrez])).toHaveLength(0);
      }
      expect(await q("update marketing_dates set title = 'hijack' where tenant_id = $1 returning id", [TENANTS.rangrez])).toHaveLength(0);
      await rejects(q("insert into social_campaigns (tenant_id, name) values ($1, 'x')", [TENANTS.rangrez]), /row-level security/);
      await rejects(q("insert into social_hashtag_sets (tenant_id, name) values ($1, 'x')", [TENANTS.rangrez]), /row-level security/);
      await rejects(q("insert into marketing_dates (tenant_id, title, on_date) values ($1, 'x', '2026-12-01')", [TENANTS.rangrez]), /row-level security/);
    });
  });

  it("shoppers can't see planner data", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.shopper, role: "authenticated" })]);
      await q("set local role authenticated");
      for (const t of ["social_campaigns", "social_hashtag_sets", "marketing_dates"]) expect(await q(`select 1 from ${t}`)).toHaveLength(0);
    });
  });

  it("a post can't reference another store's campaign", async () => {
    await as(superuser, async (q) => {
      const [b] = await q<{ id: string }>("insert into social_campaigns (tenant_id, name) values ($1, 'B only') returning id", [TENANTS.rangrez]);
      await rejects(q("insert into social_posts (tenant_id, caption, campaign_id) values ($1, 'x', $2)", [TENANTS.aangan, b!.id]), /foreign key/);
    });
  });

  it("owners can manage their own planner rows", async () => {
    await as(ownerA, async (q) => {
      const [c] = await q<{ id: string }>("insert into social_campaigns (tenant_id, name, color) values ($1, 'Own', '#112233') returning id", [TENANTS.aangan]);
      await q("insert into social_posts (tenant_id, caption, platforms, status, scheduled_at, campaign_id) values ($1, 'x', '{whatsapp,instagram}', 'planned', now(), $2)", [TENANTS.aangan, c!.id]);
      await rejects(q("insert into social_posts (tenant_id, caption, platforms) values ($1, 'x', '{tiktok}')", [TENANTS.aangan]), /check constraint/);
    });
  });
});

describe("planned posts and the publish cron", () => {
  it("the cron's due query and claim never pick planned posts", async () => {
    await as(superuser, async (q) => {
      const [planned] = await q<{ id: string }>("insert into social_posts (tenant_id, caption, platforms, status, scheduled_at) values ($1, 'planned', '{instagram,whatsapp}', 'planned', now() - interval '1 hour') returning id", [TENANTS.aangan]);
      const [sched] = await q<{ id: string }>("insert into social_posts (tenant_id, caption, platforms, status, scheduled_at) values ($1, 'due', '{instagram}', 'scheduled', now() - interval '1 minute') returning id", [TENANTS.aangan]);
      await q("set local role service_role");
      // Same filter as /api/cron/social-publish and claimPost(..., ['scheduled']).
      const due = (await q<{ id: string }>("select id from social_posts where status = 'scheduled' and scheduled_at <= now()")).map((r) => r.id);
      expect(due).toContain(sched!.id);
      expect(due).not.toContain(planned!.id);
      expect(await q("update social_posts set status = 'publishing' where id = $1 and status in ('scheduled') returning id", [planned!.id])).toHaveLength(0);
    });
  });
});
