import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, rejects, superuser } from "./db";

afterAll(closePool);

async function seed(q: (sql: string, params?: unknown[]) => Promise<unknown>) {
  await q("insert into gbp_reviews (tenant_id, location_name, review_id, star_rating, comment) values ($1, 'accounts/1/locations/1', 'ra', 5, 'A review'), ($2, 'accounts/2/locations/2', 'rb', 1, 'B review')", [TENANTS.aangan, TENANTS.rangrez]);
}

async function asUser(q: (sql: string, params?: unknown[]) => Promise<unknown>, sub: string) {
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
  await q("set local role authenticated");
}

describe("gbp_reviews is tenant-isolated", () => {
  it("another store can't read Google reviews", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await asUser(q, USERS.aanganOwner);
      expect((await q<{ comment: string }>("select comment from gbp_reviews")).map((r) => r.comment)).toEqual(["A review"]);
      expect(await q("select 1 from gbp_reviews where tenant_id = $1", [TENANTS.rangrez])).toHaveLength(0);
    });
  });

  it("members can't write the cache directly (server-side only)", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await asUser(q, USERS.aanganOwner);
      await rejects(q("insert into gbp_reviews (tenant_id, location_name, review_id) values ($1, 'l', 'x')", [TENANTS.aangan]), /permission denied|row-level security/);
      await rejects(q("update gbp_reviews set reply = 'hijack' where tenant_id = $1", [TENANTS.rangrez]), /permission denied/);
    });
  });

  it("shoppers see nothing", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await asUser(q, USERS.shopper);
      expect(await q("select 1 from gbp_reviews")).toHaveLength(0);
    });
  });
});
