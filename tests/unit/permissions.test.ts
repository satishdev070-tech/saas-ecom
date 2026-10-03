import { describe, expect, it } from "vitest";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  TENANT_PERMISSIONS,
  TENANT_ROLE_PERMISSIONS,
  platformRoleCan,
  tenantRoleCan,
} from "@/lib/permissions/matrix";

describe("tenant permission matrix", () => {
  it("gives owners every permission", () => {
    for (const p of TENANT_PERMISSIONS) expect(tenantRoleCan("owner", p)).toBe(true);
  });

  it("reserves billing to owners", () => {
    expect(tenantRoleCan("admin", "billing.manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    for (const p of TENANT_ROLE_PERMISSIONS.viewer) expect(p.endsWith(".read")).toBe(true);
  });

  it("does not let staff publish themes, refund, or manage members", () => {
    expect(tenantRoleCan("staff", "theme.publish")).toBe(false);
    expect(tenantRoleCan("staff", "orders.refund")).toBe(false);
    expect(tenantRoleCan("staff", "members.manage")).toBe(false);
  });

  it("is monotonic: each role includes the role below it", () => {
    const ladder = ["viewer", "staff", "manager", "admin", "owner"] as const;
    for (let i = 1; i < ladder.length; i++) {
      for (const p of TENANT_ROLE_PERMISSIONS[ladder[i - 1]!]) expect(TENANT_ROLE_PERMISSIONS[ladder[i]!].has(p)).toBe(true);
    }
  });
});

describe("platform permission matrix", () => {
  it("gives super_admin everything", () => {
    for (const p of PLATFORM_PERMISSIONS) expect(platformRoleCan("super_admin", p)).toBe(true);
  });

  it("does not let support manage tenants or platform users", () => {
    expect(platformRoleCan("support", "platform.tenants.manage")).toBe(false);
    expect(platformRoleCan("support", "platform.users.manage")).toBe(false);
  });

  it("uses only declared permission keys", () => {
    for (const set of Object.values(PLATFORM_ROLE_PERMISSIONS)) for (const p of set) expect(PLATFORM_PERMISSIONS).toContain(p);
  });
});
