import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { isTenantPermission, type TenantPermission } from "@/lib/permissions/matrix";

export type TeamMember = {
  membershipId: string;
  userId: string;
  role: string;
  customRoleId: string | null;
  customRoleName: string | null;
  status: "active" | "disabled";
  name: string;
  email: string;
  joinedAt: string;
  lastActiveAt: string | null;
};
export type PendingInvite = { id: string; email: string; role: string; customRoleName: string | null; expiresAt: string; createdAt: string };
export type CustomRole = { id: string; name: string; description: string | null; permissions: TenantPermission[]; memberCount: number; updatedAt: string };

/** Team list (RPC checks members.read/members.manage; emails come from auth.users server-side). */
export async function listTeam(tenantId: string): Promise<TeamMember[]> {
  const { data, error } = await (await createSupabaseServerClient()).rpc("list_tenant_members", { p_tenant: tenantId });
  if (error) throw mapDbError(error);
  return (data ?? []).map((m) => ({
    membershipId: m.membership_id,
    userId: m.user_id,
    role: m.role,
    customRoleId: m.custom_role_id,
    customRoleName: m.custom_role_name,
    status: m.status === "disabled" ? "disabled" : "active",
    name: m.display_name || m.email.split("@")[0]!,
    email: m.email,
    joinedAt: m.created_at,
    lastActiveAt: m.last_sign_in_at,
  }));
}

export async function listPendingInvites(tenantId: string): Promise<PendingInvite[]> {
  const { data, error } = await (await createSupabaseServerClient())
    .from("tenant_invitations")
    .select("id, email, role, expires_at, created_at, tenant_custom_roles(name)")
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw mapDbError(error);
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, customRoleName: i.tenant_custom_roles?.name ?? null, expiresAt: i.expires_at, createdAt: i.created_at }));
}

export async function listCustomRoles(tenantId: string): Promise<CustomRole[]> {
  const supabase = await createSupabaseServerClient();
  const [roles, members] = await Promise.all([
    supabase.from("tenant_custom_roles").select("id, name, description, permissions, updated_at").eq("tenant_id", tenantId).order("name"),
    supabase.from("tenant_memberships").select("custom_role_id").eq("tenant_id", tenantId).not("custom_role_id", "is", null),
  ]);
  if (roles.error) throw mapDbError(roles.error);
  const counts = new Map<string, number>();
  for (const m of members.data ?? []) if (m.custom_role_id) counts.set(m.custom_role_id, (counts.get(m.custom_role_id) ?? 0) + 1);
  return (roles.data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions.filter(isTenantPermission), memberCount: counts.get(r.id) ?? 0, updatedAt: r.updated_at }));
}

export async function getCustomRole(tenantId: string, id: string): Promise<CustomRole | null> {
  return (await listCustomRoles(tenantId)).find((r) => r.id === id) ?? null;
}
