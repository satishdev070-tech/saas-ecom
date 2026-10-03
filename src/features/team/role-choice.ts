import { TENANT_ROLES, type MembershipRole, type TenantRole } from "@/lib/permissions/matrix";

/**
 * A role picked in a form: "system:<role>" or "custom:<uuid>" (pure). The Store Owner role is
 * never assignable here; ownership changes are a separate, owner-only flow.
 */
export type RoleChoice = { role: MembershipRole; customRoleId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoleChoice(v: string): RoleChoice | null {
  const [kind, value] = v.split(":", 2);
  if (kind === "system" && value && value !== "owner" && (TENANT_ROLES as readonly string[]).includes(value)) return { role: value as TenantRole, customRoleId: null };
  if (kind === "custom" && value && UUID.test(value)) return { role: "custom", customRoleId: value.toLowerCase() };
  return null;
}

export function encodeRoleChoice(role: string, customRoleId: string | null): string {
  return role === "custom" && customRoleId ? `custom:${customRoleId}` : `system:${role}`;
}
