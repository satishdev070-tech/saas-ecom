import "server-only";
import { TENANT_ROLES, TENANT_ROLE_PERMISSIONS, type TenantPermission } from "@/lib/permissions/matrix";
import { ROLE_INFO } from "@/lib/permissions/labels";
import type { TenantContext } from "@/lib/tenant/membership";
import type { CustomRole } from "./queries";
import type { RoleOption } from "./components/team-ui";
import { encodeRoleChoice } from "./role-choice";

/** Roles the current member may hand out: disabled when the role has permissions they lack. */
export function roleOptions(ctx: TenantContext, custom: CustomRole[]): RoleOption[] {
  const holds = (perms: Iterable<TenantPermission>) => [...perms].every((p) => ctx.permissions.has(p));
  return [
    ...TENANT_ROLES.filter((r) => r !== "owner").map((r) => ({
      value: encodeRoleChoice(r, null),
      label: ROLE_INFO[r].label,
      description: ROLE_INFO[r].description,
      disabled: !holds(TENANT_ROLE_PERMISSIONS[r]),
      group: "Standard roles" as const,
    })),
    ...custom.map((c) => ({
      value: encodeRoleChoice("custom", c.id),
      label: c.name,
      description: c.description ?? `${c.permissions.length} permissions`,
      disabled: !holds(c.permissions),
      group: "Custom roles" as const,
    })),
  ];
}
