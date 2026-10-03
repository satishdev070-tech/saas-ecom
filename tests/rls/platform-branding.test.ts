import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, anon, as, closePool, one, superuser, user } from "./db";

afterAll(closePool);

const admin = user(USERS.platformAdmin);
const owner = user(USERS.aanganOwner);
const LOGO = { path: "branding/header_logo/0b9e7c2a-3f7e-4b55-9f43-2b0c8d1a7e11.png", width: 320, height: 64 };

describe("public platform settings (migration 2500)", () => {
  it("anon reads public.* keys only; everything else stays staff-only", async () => {
    await as(superuser, async (q) => {
      await q("insert into platform_settings (key, value) values ('public.analytics.ga4_id', '\"G-TEST1234\"'), ('public.brand.header_logo', $1)", [JSON.stringify(LOGO)]);
      await q("set local role anon");
      await q("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
      const keys = (await q<{ key: string }>("select key from platform_settings order by key")).map((r) => r.key);
      expect(keys).toEqual(["public.analytics.ga4_id", "public.brand.header_logo"]);
    });
  });

  it("only staff with platform.settings.manage can write them", async () => {
    await as(admin, async (q) => {
      const r = await q("insert into platform_settings (key, value) values ('public.auth.google_sellers', 'false') returning key");
      expect(r).toHaveLength(1);
    });
    await as(owner, async (q) => {
      await expect(q("insert into platform_settings (key, value) values ('public.auth.google_sellers', 'false')")).rejects.toThrow(/row-level security/);
    });
    await as(anon, async (q) => {
      await expect(q("insert into platform_settings (key, value) values ('public.auth.google_sellers', 'false')")).rejects.toThrow();
    });
  });
});

describe("platform-branding storage bucket", () => {
  it("is public to read and writable only by platform settings managers", async () => {
    await as(superuser, async (q) => {
      expect(one(await q<{ public: boolean }>("select public from storage.buckets where id = 'platform-branding'")).public).toBe(true);
    });
    await as(admin, async (q) => {
      const r = await q("insert into storage.objects (bucket_id, name) values ('platform-branding', $1) returning name", [LOGO.path]);
      expect(r).toHaveLength(1);
    });
    await as(owner, async (q) => {
      await expect(q("insert into storage.objects (bucket_id, name) values ('platform-branding', $1)", [LOGO.path])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("resend platform credential and store checkout options", () => {
  it("accepts the resend provider", async () => {
    await as(superuser, async (q) => {
      const r = await q("insert into platform_app_credentials (provider, secret_ciphertext) values ('resend', 'ct') returning provider");
      expect(r).toHaveLength(1);
      await expect(q("insert into platform_app_credentials (provider) values ('mailchimp')")).rejects.toThrow(/check constraint/);
    });
  });

  it("existing stores default to {} (guest checkout on); owners can change it, others can't", async () => {
    await as(superuser, async (q) => {
      for (const r of await q<{ checkout_settings: unknown }>("select checkout_settings from stores")) expect(r.checkout_settings).toEqual({});
    });
    await as(owner, async (q) => {
      const r = await q("update stores set checkout_settings = '{\"guest_checkout\": false}' where tenant_id = $1 returning tenant_id", [TENANTS.aangan]);
      expect(r).toHaveLength(1);
      await expect(q("update stores set checkout_settings = '[]' where tenant_id = $1", [TENANTS.aangan])).rejects.toThrow(/check constraint/);
      expect(await q("update stores set checkout_settings = '{}' where tenant_id = $1 returning tenant_id", [TENANTS.rangrez])).toHaveLength(0);
    });
  });
});
