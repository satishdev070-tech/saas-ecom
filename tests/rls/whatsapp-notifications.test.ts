import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, rejects, superuser } from "./db";

afterAll(closePool);

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

async function seed(q: Q) {
  for (const [t, phone] of [
    [TENANTS.aangan, "+919800000001"],
    [TENANTS.rangrez, "+919800000002"],
  ] as const) {
    await q("insert into customer_whatsapp_optins (tenant_id, phone, source, consent_text, consented_at) values ($1, $2, 'checkout', 'yes', now())", [t, phone]);
    await q("insert into whatsapp_notification_settings (tenant_id, event, enabled, template_name, language_code) values ($1, 'order_placed', true, 'order_confirmation', 'en')", [t]);
    await q("insert into notification_jobs (tenant_id, event, idempotency_key, recipient, template_name, language_code) values ($1, 'order_placed', $2, $3, 'order_confirmation', 'en')", [t, `${t}:k`, phone]);
  }
}

async function actAs(q: Q, userId: string) {
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await q("set local role authenticated");
}

describe("whatsapp notification tables are tenant-isolated", () => {
  it("owners see only their own store's consent, settings and jobs", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect((await q("select phone from customer_whatsapp_optins")).map((r) => r.phone)).toEqual(["+919800000001"]);
      expect((await q("select tenant_id from whatsapp_notification_settings")).map((r) => r.tenant_id)).toEqual([TENANTS.aangan]);
      expect((await q("select recipient from notification_jobs")).map((r) => r.recipient)).toEqual(["+919800000001"]);
    });
  });

  it("settings.write manages its own mapping only; consent and jobs are server-written", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganOwner);
      expect(await q("update whatsapp_notification_settings set enabled = false where tenant_id = $1 returning event", [TENANTS.aangan])).toHaveLength(1);
      expect(await q("update whatsapp_notification_settings set enabled = false where tenant_id = $1 returning event", [TENANTS.rangrez])).toHaveLength(0);
      await rejects(q("insert into whatsapp_notification_settings (tenant_id, event) values ($1, 'order_shipped')", [TENANTS.rangrez]), /row-level security/);
      await rejects(q("insert into customer_whatsapp_optins (tenant_id, phone, source) values ($1, '+919800000009', 'checkout')", [TENANTS.aangan]), /permission denied/);
      await rejects(q("update notification_jobs set status = 'sent'"), /permission denied/);
      await rejects(q("insert into notification_jobs (tenant_id, event, idempotency_key, recipient, template_name, language_code) values ($1, 'test', 'x', '+919800000001', 't', 'en')", [TENANTS.aangan]), /permission denied/);
      await rejects(q("select svc_claim_notification_jobs(10)"), /permission denied/);
    });
  });

  it("staff without settings.write can't see jobs or mappings; shoppers and anon see nothing", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await actAs(q, USERS.aanganStaff);
      expect(await q("select 1 from notification_jobs")).toHaveLength(0);
      expect(await q("select 1 from whatsapp_notification_settings")).toHaveLength(0);
      await rejects(q("insert into whatsapp_notification_settings (tenant_id, event) values ($1, 'order_shipped')", [TENANTS.aangan]), /row-level security/);
      await actAs(q, USERS.shopper);
      expect(await q("select 1 from customer_whatsapp_optins")).toHaveLength(0);
      expect(await q("select 1 from notification_jobs")).toHaveLength(0);
    });
    await as(anon, async (q) => {
      await rejects(q("select 1 from notification_jobs"), /permission denied/);
      await rejects(q("select 1 from customer_whatsapp_optins"), /permission denied/);
    });
  });

  it("constraints: E.164 only, one consent row per phone, idempotent jobs, enabled needs a template", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await rejects(q("insert into customer_whatsapp_optins (tenant_id, phone, source) values ($1, '9800000001', 'checkout')", [TENANTS.aangan]), /check constraint/);
      await rejects(q("insert into customer_whatsapp_optins (tenant_id, phone, source) values ($1, '+919800000001', 'checkout')", [TENANTS.aangan]), /duplicate key/);
      expect(await q("insert into notification_jobs (tenant_id, event, idempotency_key, recipient, template_name, language_code) values ($1, 'order_placed', $2, '+919800000001', 't', 'en') on conflict (tenant_id, idempotency_key) do nothing returning id", [TENANTS.aangan, `${TENANTS.aangan}:k`])).toHaveLength(0);
      await rejects(q("insert into whatsapp_notification_settings (tenant_id, event, enabled) values ($1, 'order_shipped', true)", [TENANTS.aangan]), /check constraint/);
    });
  });

  it("the claim function hands a due job to exactly one worker and fails stale sends", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("set local role service_role");
      const first = await q("select id, status, attempts from svc_claim_notification_jobs(10)");
      expect(first).toHaveLength(2);
      expect(first.every((r) => r.status === "sending" && r.attempts === 1)).toBe(true);
      expect(await q("select id from svc_claim_notification_jobs(10)")).toHaveLength(0);
      await q("update notification_jobs set locked_at = now() - interval '11 minutes'");
      await q("select svc_claim_notification_jobs(10)");
      expect((await q("select distinct status from notification_jobs")).map((r) => r.status)).toEqual(["failed"]);
    });
  });
});
