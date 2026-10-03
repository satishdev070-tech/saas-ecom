import "server-only";
import { can, requireTenantPermission } from "@/lib/tenant/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/features/platform";
import { listIntegrationSummaries } from "@/features/integrations/server/store";
import type { SocialPlatform } from "@/features/social/compose";

/** Tenant (membership), entitlement, write access and connected auto-publish networks for the social hub. */
export async function loadSocialBase() {
  const ctx = await requireTenantPermission("marketing.read");
  const [summaries, ent] = await Promise.all([listIntegrationSummaries(ctx.tenantId, "social"), getEntitlements(ctx.tenantId)]);
  const enabled = ent.isEnabled("social_media");
  const write = can(ctx, "marketing.write") && enabled;
  const connected = summaries.filter((s) => s.status === "connected" && s.enabled && s.provider !== "youtube").map((s) => s.provider as SocialPlatform);
  return { ctx, summaries, enabled, write, connected };
}

/** Products for "Start from product" (most recently updated, active first). */
export async function listProductOptions(tenantId: string): Promise<{ id: string; title: string }[]> {
  const { data } = await (await createSupabaseServerClient()).from("products").select("id, title, status").eq("tenant_id", tenantId).neq("status", "archived").order("updated_at", { ascending: false }).limit(200);
  return (data ?? []).map((p) => ({ id: p.id, title: p.status === "active" ? p.title : `${p.title} (${p.status})` }));
}

export function PlanNotice({ enabled }: { enabled: boolean }) {
  return enabled ? null : <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning">Social publishing isn&apos;t included in your plan.</p>;
}

const OAUTH_ERRORS: Record<string, string> = {
  state: "The connection link expired or was opened in a different browser. Please try again.",
  denied: "The connection was cancelled.",
  plan: "Social publishing isn't available on your plan.",
  not_configured: "This network hasn't been set up by the platform yet.",
  expired: "The provider says the sign-in expired. Please connect again.",
  provider: "The provider didn't accept the connection. Please try again, and make sure you grant all requested permissions.",
};

/** OAuth callback results (?error= / ?connected=), shown on the hub pages the callback redirects to. */
export function OAuthBanners({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const errorKey = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      {errorKey ? <p role="alert" className="rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">{OAUTH_ERRORS[errorKey] ?? OAUTH_ERRORS.provider}</p> : null}
      {typeof sp.connected === "string" ? <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-small text-success">Connected: {sp.connected.split(",").filter((x) => /^[a-z]+$/.test(x)).join(", ")}.</p> : null}
    </>
  );
}
