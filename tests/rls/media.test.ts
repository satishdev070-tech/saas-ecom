import { afterAll, describe, expect, it } from "vitest";
import { TENANTS, USERS, as, closePool, one, rejects, superuser, user } from "./db";

afterAll(closePool);

const aPath = `tenant/${TENANTS.aangan}/media/11111111-1111-4111-a111-111111111111.webp`;
const bPath = `tenant/${TENANTS.rangrez}/media/22222222-2222-4222-a222-222222222222.webp`;

async function seed(q: (sql: string, params?: unknown[]) => Promise<unknown[]>) {
  await q("insert into media_assets (tenant_id, storage_path, mime_type, bytes, filename, folder) values ($1, $2, 'image/webp', 100, 'a.webp', 'products'), ($3, $4, 'image/webp', 100, 'b.webp', 'general')", [TENANTS.aangan, aPath, TENANTS.rangrez, bPath]);
}

describe("media library isolation", () => {
  it("members only see and change their own store's media", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      const rows = await q<{ storage_path: string }>("select storage_path from media_assets");
      expect(rows.map((r) => r.storage_path)).toContain(aPath);
      expect(rows.map((r) => r.storage_path)).not.toContain(bPath);
      expect(await q("update media_assets set alt_text = 'x' where storage_path = $1 returning id", [bPath])).toHaveLength(0);
      expect(await q("delete from media_assets where storage_path = $1 returning id", [bPath])).toHaveLength(0);
      await rejects(q("insert into media_assets (tenant_id, storage_path, mime_type, bytes) values ($1, $2, 'image/webp', 1)", [TENANTS.rangrez, `tenant/${TENANTS.rangrez}/media/x.webp`]), /row-level security/);
      // A path under another tenant's prefix can't be catalogued even for your own tenant.
      await rejects(q("insert into media_assets (tenant_id, storage_path, mime_type, bytes) values ($1, $2, 'image/webp', 1)", [TENANTS.aangan, bPath]), /check constraint/);
    });
  });

  it("media_usage is scoped to the caller's tenant", async () => {
    await as(superuser, async (q) => {
      await seed(q);
      await q("update categories set image_path = $1 where tenant_id = $2 and slug = 'kurtas'", [aPath, TENANTS.aangan]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.aanganOwner, role: "authenticated" })]);
      await q("set local role authenticated");
      const usage = await q<{ kind: string }>("select * from public.media_usage($1, $2)", [TENANTS.aangan, aPath]);
      expect(usage.map((u) => u.kind)).toEqual(["category"]);
      // Asking about another tenant is refused; a foreign path under your tenant id returns nothing.
      await rejects(q("select * from public.media_usage($1, $2)", [TENANTS.rangrez, bPath]), /not allowed/);
      expect(await q("select * from public.media_usage($1, $2)", [TENANTS.aangan, bPath])).toHaveLength(0);
    });
  });

  it("read-only roles cannot catalogue files; theme editors can", async () => {
    await as(superuser, async (q) => {
      const role = one(await q<{ id: string }>("insert into tenant_custom_roles (tenant_id, name, permissions) values ($1, 'Theme only', '{store.read,theme.edit}') returning id", [TENANTS.aangan]));
      await q("insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-a000-0000000000d1', 'theme@aangan.test', 'authenticated', 'authenticated')");
      await q("insert into tenant_memberships (tenant_id, user_id, role, custom_role_id) values ($1, '00000000-0000-4000-a000-0000000000d1', 'custom', $2)", [TENANTS.aangan, role.id]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: "00000000-0000-4000-a000-0000000000d1", role: "authenticated" })]);
      await q("set local role authenticated");
      expect(await q("insert into media_assets (tenant_id, storage_path, mime_type, bytes) values ($1, $2, 'image/webp', 1) returning id", [TENANTS.aangan, `tenant/${TENANTS.aangan}/media/t.webp`])).toHaveLength(1);
    });
    await as(user(USERS.shopper), (q) => rejects(q("insert into media_assets (tenant_id, storage_path, mime_type, bytes) values ($1, $2, 'image/webp', 1)", [TENANTS.aangan, `tenant/${TENANTS.aangan}/media/s.webp`]), /row-level security/));
  });
});
