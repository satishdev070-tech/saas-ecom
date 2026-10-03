import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, rejects, superuser } from "./db";

afterAll(closePool);

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

async function seed(q: Q) {
  await q("insert into email_log (tenant_id, kind, recipient_hash, recipient_masked, idempotency_key, status) values ($1, 'order_placed', 'h-a', 'a***@x.in', 'k-a', 'sent')", [TENANTS.aangan]);
  await q("insert into email_log (tenant_id, kind, recipient_hash, recipient_masked, idempotency_key, status) values ($1, 'order_placed', 'h-b', 'b***@x.in', 'k-b', 'sent')", [TENANTS.rangrez]);
  await q("insert into email_preferences (tenant_id, settings) values ($1, '{\"order_shipped\": false}')", [TENANTS.rangrez]);
}

async function actAs(q: Q, userId: string) {
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await q("set local role authenticated");
}

describe("email_log / email_preferences RLS", () => {
  it("staff read only their own store's log; nobody writes it from a session", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect((await q("select recipient_masked from email_log")).map((r) => r.recipient_masked)).toEqual(["a***@x.in"]);
      await rejects(q("insert into email_log (tenant_id, kind, recipient_hash, status) values ($1, 'x', 'h', 'sent')", [TENANTS.aangan]), /permission denied/);
      await rejects(q("update email_log set status = 'failed'"), /permission denied/);
      await rejects(q("delete from email_log"), /permission denied/);
    });
  });

  it("one SENT row per idempotency key", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await rejects(q("insert into email_log (tenant_id, kind, recipient_hash, idempotency_key, status) values ($1, 'order_placed', 'h', 'k-a', 'sent')", [TENANTS.aangan]), /duplicate key/);
      // failed attempts may repeat
      await q("insert into email_log (tenant_id, kind, recipient_hash, idempotency_key, status) values ($1, 'order_placed', 'h', 'k-a', 'failed')", [TENANTS.aangan]);
    });
  });

  it("preferences are tenant-scoped for read and write", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect(await q("select 1 from email_preferences")).toHaveLength(0);
      await q("insert into email_preferences (tenant_id, settings) values ($1, '{\"abandoned_cart\": true}')", [TENANTS.aangan]);
      expect(await q("update email_preferences set settings = '{}' where tenant_id = $1 returning 1", [TENANTS.rangrez])).toHaveLength(0);
      await rejects(q("insert into email_preferences (tenant_id) values ($1)", [TENANTS.rangrez]), /row-level security|duplicate key/);
    });
  });

  it("shoppers and anonymous callers see nothing", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.shopper);
      expect(await q("select 1 from email_log")).toHaveLength(0);
      expect(await q("select 1 from email_preferences")).toHaveLength(0);
    });
    await as(anon, async (q) => {
      await rejects(q("select 1 from email_log"), /permission denied/);
    });
  });
});
