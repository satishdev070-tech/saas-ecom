import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Where the platform sends people to sign in. Sellers and platform staff have separate entry points. */
export const SELLER_LOGIN_PATH = "/seller/login";
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Login page for a protected path: the platform console has its own sign-in screen. */
export function loginPathFor(next: string): string {
  const base = next === "/admin" || next.startsWith("/admin/") ? ADMIN_LOGIN_PATH : SELLER_LOGIN_PATH;
  return `${base}?next=${encodeURIComponent(next)}`;
}

/**
 * Default destination after sign-in when no `next` was requested. Read with the user's own
 * session (RLS: members see only their own membership rows), never from request input.
 * Sellers → dashboard; platform staff without a store → admin console; nobody → onboarding.
 */
export async function landingPathFor(userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const [tenant, platform] = await Promise.all([
    supabase.from("tenant_memberships").select("tenant_id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    supabase.from("platform_memberships").select("status").eq("user_id", userId).maybeSingle(),
  ]);
  if ((tenant.count ?? 0) > 0) return "/dashboard";
  if (platform.data?.status === "active") return "/admin";
  return "/onboarding";
}
