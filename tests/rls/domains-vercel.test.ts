import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, one, rejects, superuser, user } from "./db";

afterAll(closePool);

const aOwner = user(USERS.aanganOwner);

describe("domains: Vercel edge columns (migration 21)", () => {
  it("new columns default to an empty, provider-less row", async () => {
    await as(aOwner, async (q) => {
      const row = one(
        await q<{ provider: string | null; provider_status: string | null; dns_records: unknown; redirect_hostname: string | null }>(
          "insert into domains (tenant_id, hostname, type) values ($1, 'shop.aangan.in', 'custom') returning provider, provider_status, dns_records, redirect_hostname",
          [TENANTS.aangan],
        ),
      );
      expect(row).toEqual({ provider: null, provider_status: null, dns_records: [], redirect_hostname: null });
    });
  });

  it("sellers can't set server-owned edge fields on insert", async () => {
    for (const [col, val] of [
      ["provider_status", "'active'"],
      ["provider", "'vercel'"],
      ["provider_ref", "'x'"],
      ["redirect_hostname", "'aangan.in'"],
      ["dns_records", `'[{"type":"A","name":"shop.aangan.in","value":"1.2.3.4","purpose":"routing"}]'::jsonb`],
    ] as const) {
      await rejects(
        as(aOwner, (q) => q(`insert into domains (tenant_id, hostname, type, ${col}) values ($1, 'shop.aangan.in', 'custom', ${val})`, [TENANTS.aangan])),
        /row-level security/,
      );
    }
  });

  it("check constraints reject unknown states and non-array records", async () => {
    await rejects(
      as(superuser, (q) => q("insert into domains (tenant_id, hostname, type, provider_status) values ($1, 'x.aangan.in', 'custom', 'live')", [TENANTS.aangan])),
      /check constraint/,
    );
    await rejects(
      as(superuser, (q) => q(`insert into domains (tenant_id, hostname, type, dns_records) values ($1, 'x.aangan.in', 'custom', '{}'::jsonb)`, [TENANTS.aangan])),
      /check constraint/,
    );
    await as(superuser, async (q) => {
      const r = await q("insert into domains (tenant_id, hostname, type, provider, provider_status, redirect_hostname) values ($1, 'aangan.in', 'custom', 'vercel', 'pending_dns', 'www.aangan.in') returning id", [TENANTS.aangan]);
      expect(r).toHaveLength(1);
    });
  });
});
