import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { PLATFORM_ROLE_PERMISSIONS, type PlatformPermission, type PlatformRole } from "@/lib/permissions/matrix";

export type PlatformContext = { user: SessionUser; role: PlatformRole; permissions: ReadonlySet<PlatformPermission> };

export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  const user = await requireUser("/admin");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("platform_memberships").select("role, status").eq("user_id", user.id).maybeSingle();
  if (!data || data.status !== "active") return null;
  const role = data.role as PlatformRole;
  return { user, role, permissions: PLATFORM_ROLE_PERMISSIONS[role] };
});

/** Admin pages 404 for non-platform users (don't reveal the console exists). */
export async function requirePlatform(permission?: PlatformPermission): Promise<PlatformContext> {
  const ctx = await getPlatformContext();
  if (!ctx) notFound();
  if (permission && !ctx.permissions.has(permission)) notFound();
  return ctx;
}

export function assertPlatformPermission(ctx: PlatformContext, permission: PlatformPermission) {
  if (!ctx.permissions.has(permission)) throw new AppError("FORBIDDEN", { context: { permission } });
}
