import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLATFORM_ROLE_PERMISSIONS, TENANT_PERMISSIONS, TENANT_ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { PERMISSION_GROUPS } from "@/lib/permissions/labels";

/**
 * The SQL seeds of role permissions must match the TypeScript matrix exactly.
 * Tenant roles are (re)seeded by the RBAC migration; platform roles by reference data.
 */
const tenantSql = readFileSync("supabase/migrations/20260926001200_rbac.sql", "utf8");
const platformSql = readFileSync("supabase/migrations/20260924000600_reference_data.sql", "utf8");

function pairs(sql: string, table: string): Set<string> {
  const block = sql.split(`insert into public.${table} (role, permission) values`)[1]!.split("on conflict")[0]!;
  return new Set([...block.matchAll(/\('([a-z_]+)','([a-z_.]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`));
}

describe("role permissions SQL <-> matrix", () => {
  it("tenant roles match", () => {
    const expected = new Set(Object.entries(TENANT_ROLE_PERMISSIONS).flatMap(([r, ps]) => [...ps].map((p) => `${r}:${p}`)));
    expect(pairs(tenantSql, "role_permissions")).toEqual(expected);
  });
  it("platform roles match", () => {
    const expected = new Set(Object.entries(PLATFORM_ROLE_PERMISSIONS).flatMap(([r, ps]) => [...ps].map((p) => `${r}:${p}`)));
    expect(pairs(platformSql, "platform_role_permissions")).toEqual(expected);
  });
  it("the custom-role permission allowlist in SQL matches the matrix", () => {
    const list = tenantSql.match(/permissions <@ array\[([^\]]+)\]/)![1]!;
    expect(new Set([...list.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]))).toEqual(new Set(TENANT_PERMISSIONS));
  });
});

describe("permission groups (Roles & permissions editor)", () => {
  it("list every permission exactly once", () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(keys.length).toBe(new Set(keys).size);
    expect(new Set(keys)).toEqual(new Set(TENANT_PERMISSIONS));
  });
});
