"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/actions/form";
import { email, parseInput } from "@/lib/validation/common";
import { AppError } from "@/lib/errors";
import { assertPermission, requireTenant } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { hashToken, randomToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { platformOrigin } from "@/lib/platform/urls";
import { audit } from "@/lib/audit";
import { OWNER_ONLY_PERMISSIONS, TENANT_PERMISSIONS } from "@/lib/permissions/matrix";
import { roleLabel } from "@/lib/permissions/labels";
import { sendTeamInviteEmail } from "@/features/notifications/email/direct";
import { parseRoleChoice } from "./role-choice";

async function teamManager() {
  const ctx = await requireTenant();
  assertPermission(ctx, "members.manage");
  return ctx;
}

async function rolesManager() {
  const ctx = await requireTenant();
  assertPermission(ctx, "roles.manage");
  return ctx;
}

/** Postgres guard errors from the RBAC triggers → readable messages. */
function roleError(error: { code?: string; message: string }): AppError {
  if (error.message.includes("permissions you do not hold") || error.message.includes("permissions you hold")) {
    return new AppError("FORBIDDEN", { message: "You can only give out permissions you have yourself.", fieldErrors: { role: ["That role has permissions you don't have."] } });
  }
  if (error.message.includes("your own role")) return new AppError("FORBIDDEN", { message: "You can't change your own role." });
  return mapDbError(error);
}

const roleField = z.string().min(3).max(60);

// ------------------------------------------------------------------ invitations

async function sendInvite(ctx: Awaited<ReturnType<typeof teamManager>>, to: string, roleName: string, token: string) {
  const link = `${platformOrigin()}/invite/${token}`;
  await sendTeamInviteEmail({
    tenantId: ctx.tenantId,
    to,
    inviterName: ctx.user.displayName ?? "A colleague",
    roleName,
    acceptUrl: link,
    idempotencyKey: `${ctx.tenantId}:invite:${hashToken(token).slice(0, 24)}`,
  });
  return link;
}

export async function inviteMemberAction(_prev: ActionResult<{ link: string }> | null, fd: FormData): Promise<ActionResult<{ link: string }>> {
  const result = await runAction("team.invite", async () => {
    const ctx = await teamManager();
    const v = parseInput(z.object({ email, role: roleField }), formToObject(fd));
    const choice = parseRoleChoice(v.role);
    if (!choice) throw new AppError("VALIDATION", { fieldErrors: { role: ["Choose a role"] } });
    await rateLimit("team:invite", ctx.tenantId, 30, 3600);
    const supabase = await createSupabaseServerClient();
    let customName: string | null = null;
    if (choice.customRoleId) {
      const { data } = await supabase.from("tenant_custom_roles").select("name").eq("id", choice.customRoleId).eq("tenant_id", ctx.tenantId).maybeSingle();
      if (!data) throw new AppError("VALIDATION", { fieldErrors: { role: ["That role no longer exists"] } });
      customName = data.name;
    }
    const token = randomToken(32);
    const { error } = await supabase.from("tenant_invitations").insert({
      tenant_id: ctx.tenantId,
      email: v.email,
      role: choice.role,
      custom_role_id: choice.customRoleId,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      invited_by: ctx.user.id,
    });
    if (error?.code === "23505") throw new AppError("CONFLICT", { message: "There's already an open invitation for that email.", fieldErrors: { email: ["Already invited"] } });
    if (error) throw roleError(error);
    const link = await sendInvite(ctx, v.email, roleLabel(choice.role, customName), token);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "member.invited", entityType: "invitation", metadata: { email: v.email, role: choice.role, custom_role_id: choice.customRoleId } });
    return { link };
  });
  if (result.ok) refresh();
  return result;
}

/** New token + expiry for an open invitation, emailed again. The old link stops working. */
export async function resendInvitationAction(_prev: ActionResult<{ link: string }> | null, fd: FormData): Promise<ActionResult<{ link: string }>> {
  const result = await runAction("team.resend", async () => {
    const ctx = await teamManager();
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    await rateLimit("team:invite", ctx.tenantId, 30, 3600);
    const supabase = await createSupabaseServerClient();
    const token = randomToken(32);
    const { data, error } = await supabase
      .from("tenant_invitations")
      .update({ token_hash: hashToken(token), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() })
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("email, role, tenant_custom_roles(name)")
      .maybeSingle();
    if (error) throw roleError(error);
    if (!data) throw new AppError("NOT_FOUND", { message: "That invitation is no longer open." });
    const link = await sendInvite(ctx, data.email, roleLabel(data.role, data.tenant_custom_roles?.name), token);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "member.invite_resent", entityType: "invitation", entityId: id });
    return { link };
  });
  if (result.ok) refresh();
  return result;
}

export async function revokeInvitationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("team.revoke", async () => {
    const ctx = await teamManager();
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("tenant_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "member.invite_revoked", entityType: "invitation", entityId: id });
  });
  if (result.ok) refresh();
  return result;
}

// ------------------------------------------------------------------ members

async function loadEditableMember(ctx: Awaited<ReturnType<typeof teamManager>>, membershipId: string) {
  const { data } = await (await createSupabaseServerClient()).from("tenant_memberships").select("user_id, role").eq("id", membershipId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND");
  if (data.role === "owner") throw new AppError("FORBIDDEN", { message: "The Store Owner can't be changed." });
  if (data.user_id === ctx.user.id) throw new AppError("FORBIDDEN", { message: "You can't change your own access." });
  return data;
}

export async function changeMemberRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("team.role", async () => {
    const ctx = await teamManager();
    const v = parseInput(z.object({ membershipId: z.uuid(), role: roleField }), formToObject(fd));
    const choice = parseRoleChoice(v.role);
    if (!choice) throw new AppError("VALIDATION", { fieldErrors: { role: ["Choose a role"] } });
    await loadEditableMember(ctx, v.membershipId);
    const { error } = await (await createSupabaseServerClient())
      .from("tenant_memberships")
      .update({ role: choice.role, custom_role_id: choice.customRoleId })
      .eq("id", v.membershipId)
      .eq("tenant_id", ctx.tenantId);
    if (error) throw roleError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "member.role_changed", entityType: "membership", entityId: v.membershipId, metadata: { role: choice.role, custom_role_id: choice.customRoleId } });
  });
  if (result.ok) refresh();
  return result;
}

export async function setMemberStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("team.status", async () => {
    const ctx = await teamManager();
    const v = parseInput(z.object({ membershipId: z.uuid(), status: z.enum(["active", "disabled"]) }), formToObject(fd));
    await loadEditableMember(ctx, v.membershipId);
    const { error } = await (await createSupabaseServerClient()).from("tenant_memberships").update({ status: v.status }).eq("id", v.membershipId).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: v.status === "disabled" ? "member.deactivated" : "member.reactivated", entityType: "membership", entityId: v.membershipId });
  });
  if (result.ok) refresh();
  return result;
}

export async function removeMemberAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("team.remove", async () => {
    const ctx = await teamManager();
    const { membershipId } = parseInput(z.object({ membershipId: z.uuid() }), formToObject(fd));
    await loadEditableMember(ctx, membershipId);
    const { error } = await (await createSupabaseServerClient()).from("tenant_memberships").delete().eq("id", membershipId).eq("tenant_id", ctx.tenantId);
    if (error) throw mapDbError(error);
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "member.removed", entityType: "membership", entityId: membershipId });
  });
  if (result.ok) refresh();
  return result;
}

// ------------------------------------------------------------------ custom roles

const ASSIGNABLE = TENANT_PERMISSIONS.filter((p) => !OWNER_ONLY_PERMISSIONS.includes(p));
const roleSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(240).optional().transform((v) => v || null),
  permissions: z.array(z.enum(ASSIGNABLE as [string, ...string[]])).min(1, "Pick at least one permission"),
});

export async function saveCustomRoleAction(_prev: ActionResult<{ id: string }> | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  let savedId: string | null = null;
  const result = await runAction("roles.save", async () => {
    const ctx = await rolesManager();
    const raw = formToObject(fd);
    const v = parseInput(roleSchema, { ...raw, permissions: fd.getAll("permissions").map(String) });
    const lacking = v.permissions.filter((p) => !ctx.permissions.has(p as never));
    if (lacking.length) throw new AppError("FORBIDDEN", { message: "You can only give out permissions you have yourself.", fieldErrors: { permissions: ["Includes permissions you don't have"] } });
    const supabase = await createSupabaseServerClient();
    const row = { tenant_id: ctx.tenantId, name: v.name, description: v.description, permissions: v.permissions };
    const { data, error } = v.id
      ? await supabase.from("tenant_custom_roles").update(row).eq("id", v.id).eq("tenant_id", ctx.tenantId).select("id").maybeSingle()
      : await supabase.from("tenant_custom_roles").insert({ ...row, created_by: ctx.user.id }).select("id").single();
    if (error?.code === "23505") throw new AppError("CONFLICT", { message: "A role with that name already exists.", fieldErrors: { name: ["Already used"] } });
    if (error) throw roleError(error);
    if (!data) throw new AppError("NOT_FOUND");
    savedId = data.id;
    return { id: data.id };
  });
  if (result.ok && savedId) redirect(`/dashboard/settings/roles?saved=1`);
  return result;
}

export async function deleteCustomRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const result = await runAction("roles.delete", async () => {
    const ctx = await rolesManager();
    const { id } = parseInput(z.object({ id: z.uuid() }), formToObject(fd));
    const { error } = await (await createSupabaseServerClient()).from("tenant_custom_roles").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error?.code === "23503") throw new AppError("CONFLICT", { message: "Members still have this role. Give them another role first." });
    if (error) throw mapDbError(error);
  });
  if (result.ok) refresh();
  return result;
}
