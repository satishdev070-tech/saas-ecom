import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, one, user } from "./db";

afterAll(closePool);

const A = TENANTS.aangan;
const R = TENANTS.rangrez;

describe("plan requests (migration 2900)", () => {
  it("owner requests a plan; staff and other stores can't; platform approves → plan switched, store active, audited", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const growth = one(await q<{ id: string }>("select id from plans where code = 'growth'"));
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      const id = one(await q<{ request_plan: string }>("select request_plan($1, $2, 'yearly', 'GST: 27ABCDE1234F1Z5')", [A, growth.id])).request_plan;
      // A second request replaces the first (one pending per store).
      const id2 = one(await q<{ request_plan: string }>("select request_plan($1, $2, 'monthly', '')", [A, growth.id])).request_plan;
      const rows = await q<{ id: string; status: string }>("select id, status from plan_requests where tenant_id = $1 order by created_at", [A]);
      expect(rows.find((r) => r.id === id)?.status).toBe("cancelled");
      expect(rows.find((r) => r.id === id2)?.status).toBe("pending");
      // Owner of A can't request for R, and can't read R's requests.
      await expect(q("select request_plan($1, $2, 'monthly', '')", [R, growth.id])).rejects.toThrow(/not allowed/);
      // Owner can't decide their own request.
      await expect(q("select platform_decide_plan_request($1, true, '', null)", [id2])).rejects.toThrow(/not allowed/);

      // Platform admin approves.
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.platformAdmin, role: "authenticated" })]);
      await q("update tenants set status = 'trial' where id = $1", [A]);
      await q("select platform_decide_plan_request($1, true, 'Paid via UPI ref 123', 12)", [id2]);
      const t = one(await q<{ status: string; plan_id: string }>("select status, plan_id from tenants where id = $1", [A]));
      expect(t).toEqual({ status: "active", plan_id: growth.id });
      expect(one(await q<{ status: string }>("select status from plan_requests where id = $1", [id2])).status).toBe("approved");
      await expect(q("select platform_decide_plan_request($1, false, '', null)", [id2])).rejects.toThrow(/not pending/);
      const audits = await q<{ action: string }>("select action from audit_logs where entity_id = $1 order by created_at", [id2]);
      expect(audits.map((a) => a.action)).toEqual(["plan.requested", "plan.request_approved"]);
    });
  });

  it("staff can read but not request; rows are invisible to other stores", async () => {
    await as(user(USERS.aanganOwner), async (q) => {
      const growth = one(await q<{ id: string }>("select id from plans where code = 'growth'"));
      await q("select request_plan($1, $2, 'monthly', '')", [A, growth.id]);
    });
    await as(user(USERS.aanganStaff), async (q) => {
      const growth = one(await q<{ id: string }>("select id from plans where code = 'growth'"));
      await expect(q("select request_plan($1, $2, 'monthly', '')", [A, growth.id])).rejects.toThrow(/not allowed/);
    });
    await as(user(USERS.rangrezOwner), async (q) => {
      expect(await q("select id from plan_requests where tenant_id = $1", [A])).toEqual([]);
      await expect(q("insert into plan_requests (tenant_id, plan_id) select $1, id from plans limit 1", [R])).rejects.toThrow();
    });
  });
});
