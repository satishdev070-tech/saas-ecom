import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, rejects, superuser } from "./db";

afterAll(closePool);

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** One conversation + message per store, as the verified webhook would store them. */
async function seed(q: Q) {
  const [a] = await q("insert into social_conversations (tenant_id, channel, external_thread_id, participant_id, participant_name, unread_count) values ($1, 'whatsapp', '919800000001', '919800000001', 'A customer', 1) returning id", [TENANTS.aangan]);
  const [b] = await q("insert into social_conversations (tenant_id, channel, external_thread_id, participant_id, participant_name, unread_count) values ($1, 'facebook', 'PSID-B', 'PSID-B', 'B customer', 2) returning id", [TENANTS.rangrez]);
  await q("insert into social_messages (tenant_id, conversation_id, direction, body, external_id) values ($1, $2, 'in', 'hello A', 'wamid.A')", [TENANTS.aangan, a!.id]);
  await q("insert into social_messages (tenant_id, conversation_id, direction, body, external_id) values ($1, $2, 'in', 'hello B', 'm_B')", [TENANTS.rangrez, b!.id]);
  return { a: a!.id as string, b: b!.id as string };
}

async function actAs(q: Q, userId: string) {
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await q("set local role authenticated");
}

describe("unified inbox tables are tenant-isolated", () => {
  it("another store can't read conversations or messages", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect((await q("select participant_name from social_conversations")).map((r) => r.participant_name)).toEqual(["A customer"]);
      expect((await q("select body from social_messages")).map((r) => r.body)).toEqual(["hello A"]);
    });
  });

  it("another store can't update, close or mark read; staff can't insert or delete messages", async () => {
    await as(superuser, async (q) => {
      const { a, b } = await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect(await q("update social_conversations set unread_count = 0, status = 'closed' where id = $1 returning id", [b])).toHaveLength(0);
      // Own store: marketing.write may mark read / close.
      expect(await q("update social_conversations set unread_count = 0, status = 'closed' where id = $1 returning id", [a])).toHaveLength(1);
      await rejects(q("insert into social_conversations (tenant_id, channel, external_thread_id, participant_id) values ($1, 'facebook', 'x', 'x')", [TENANTS.rangrez]), /permission denied|row-level security/);
      await rejects(q("insert into social_messages (tenant_id, conversation_id, direction, body) values ($1, $2, 'out', 'spoof')", [TENANTS.aangan, a]), /permission denied/);
      await rejects(q("delete from social_messages"), /permission denied/);
    });
  });

  it("shoppers and anonymous callers see nothing", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.shopper);
      expect(await q("select 1 from social_conversations")).toHaveLength(0);
      expect(await q("select 1 from social_messages")).toHaveLength(0);
    });
    await as(anon, async (q) => {
      await rejects(q("select 1 from social_conversations"), /permission denied/);
    });
  });

  it("messages are idempotent per store and can't point at another store's conversation", async () => {
    await as(superuser, async (q) => {
      const { a, b } = await seed(q);
      await rejects(q("insert into social_messages (tenant_id, conversation_id, direction, body, external_id) values ($1, $2, 'in', 'dup', 'wamid.A')", [TENANTS.aangan, a]), /duplicate key/);
      // ON CONFLICT DO NOTHING (the webhook's upsert) is a no-op for a Meta retry.
      expect(await q("insert into social_messages (tenant_id, conversation_id, direction, body, external_id) values ($1, $2, 'in', 'dup', 'wamid.A') on conflict (tenant_id, external_id) do nothing returning id", [TENANTS.aangan, a])).toHaveLength(0);
      await rejects(q("insert into social_messages (tenant_id, conversation_id, direction, body) values ($1, $2, 'in', 'cross')", [TENANTS.aangan, b]), /foreign key/);
      await rejects(q("insert into social_conversations (tenant_id, channel, external_thread_id, participant_id) values ($1, 'whatsapp', '919800000001', '1')", [TENANTS.aangan]), /duplicate key/);
    });
  });

  it("the webhook's verified-mapping lookup only matches a connected, enabled integration", async () => {
    await as(superuser, async (q) => {
      await q("insert into tenant_integrations (tenant_id, kind, provider, enabled, environment, public_config, status) values ($1, 'social', 'whatsapp', true, 'live', '{\"phone_number_id\":\"PNID-A\"}', 'connected')", [TENANTS.aangan]);
      await q("insert into tenant_integrations (tenant_id, kind, provider, enabled, environment, public_config, status) values ($1, 'social', 'whatsapp', true, 'live', '{\"phone_number_id\":\"PNID-B\"}', 'not_connected')", [TENANTS.rangrez]);
      await q("set local role service_role");
      // Same filter as tenantForAccount() in src/features/inbox/server/ingest.ts.
      const lookup = (id: string) => q("select tenant_id from tenant_integrations where provider = 'whatsapp' and status = 'connected' and enabled and public_config->>'phone_number_id' = $1 limit 2", [id]);
      expect((await lookup("PNID-A")).map((r) => r.tenant_id)).toEqual([TENANTS.aangan]);
      expect(await lookup("PNID-B")).toHaveLength(0);
      expect(await lookup("unknown")).toHaveLength(0);
    });
  });
});
