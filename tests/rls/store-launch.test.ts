import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, one, superuser, user } from "./db";

afterAll(closePool);

const aOwner = user(USERS.aanganOwner);
const rOwner = user(USERS.rangrezOwner);
const shopper = user(USERS.shopper);

describe("stores.launch_status (migration 2400)", () => {
  it("existing stores default to live (no behaviour change for current merchants)", async () => {
    await as(superuser, async (q) => {
      const rows = await q<{ launch_status: string; launched_at: string | null }>("select launch_status, launched_at from stores");
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r).toEqual({ launch_status: "live", launched_at: null });
    });
  });

  it("the owner can mark their store draft and publish it", async () => {
    await as(aOwner, async (q) => {
      await q("update stores set launch_status = 'draft' where tenant_id = $1", [TENANTS.aangan]);
      expect(one(await q<{ launch_status: string }>("select launch_status from stores where tenant_id = $1", [TENANTS.aangan])).launch_status).toBe("draft");
      const pub = await q<{ tenant_id: string }>("update stores set launch_status = 'live', launched_at = now() where tenant_id = $1 and launch_status = 'draft' returning tenant_id", [TENANTS.aangan]);
      expect(pub).toHaveLength(1);
    });
  });

  it("another store's owner and shoppers cannot change it (RLS)", async () => {
    for (const caller of [rOwner, shopper]) {
      await as(caller, async (q) => {
        const r = await q("update stores set launch_status = 'draft' where tenant_id = $1 returning tenant_id", [TENANTS.aangan]);
        expect(r).toHaveLength(0);
      });
    }
    await as(anon, async (q) => {
      await expect(q("update stores set launch_status = 'draft' where tenant_id = $1", [TENANTS.aangan])).rejects.toThrow();
    });
  });

  it("visitors (anon) can read the flag for open stores, which the storefront needs", async () => {
    await as(anon, async (q) => {
      const r = one(await q<{ launch_status: string }>("select launch_status from stores where tenant_id = $1", [TENANTS.aangan]));
      expect(["draft", "live"]).toContain(r.launch_status);
    });
  });

  it("rejects unknown states", async () => {
    await expect(as(superuser, (q) => q("update stores set launch_status = 'published' where tenant_id = $1", [TENANTS.aangan]))).rejects.toThrow(/check constraint/);
  });
});
