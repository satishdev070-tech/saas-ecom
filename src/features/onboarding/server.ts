import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMemberships, membershipPermissions, type TenantContext } from "@/lib/tenant/membership";
import type { SessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/observability/logger";
import { isIndustry, type IndustrySlug } from "@/features/stores/industries";
import { isThemeKey } from "@/features/marketing-site/themes";
import { cleanPlanCode } from "./steps";

/** A store the signed-in user OWNS, as onboarding needs it. Read with the user's session (RLS). */
export type OnboardingStore = {
  tenantId: string;
  name: string;
  slug: string;
  launchStatus: "draft" | "live" | "unknown";
  category: IndustrySlug | null;
  trialEndsAt: string | null;
  planName: string | null;
  draftThemeKey: string | null;
};

type StoreRow = {
  tenant_id: string;
  name: string;
  launch_status?: string | null;
  store_categories: { slug: string } | { slug: string }[] | null;
  tenants: { slug: string; trial_ends_at: string | null; plans: { name: string } | { name: string }[] | null } | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Owned stores with onboarding details. Tolerates a database without migration 2400. */
export async function listOwnedStores(userId: string): Promise<OnboardingStore[]> {
  const owned = (await listMemberships(userId)).filter((m) => m.role === "owner");
  if (owned.length === 0) return [];
  const ids = owned.map((m) => m.tenantId);
  const supabase = await createSupabaseServerClient();
  const base = "tenant_id, name, store_categories(slug), tenants(slug, trial_ends_at, plans(name))";
  let res = await supabase.from("stores").select(`${base}, launch_status`).in("tenant_id", ids);
  if (res.error) {
    logger.warn("onboarding.launch_status_unavailable", { code: res.error.code });
    res = (await supabase.from("stores").select(base).in("tenant_id", ids)) as typeof res;
  }
  if (res.error) throw res.error;
  const drafts = await supabase.from("theme_versions").select("tenant_id, theme_key").in("tenant_id", ids).eq("status", "draft");
  const draftKey = new Map((drafts.data ?? []).map((d) => [d.tenant_id, d.theme_key]));
  return ((res.data ?? []) as unknown as StoreRow[]).map((r) => {
    const m = owned.find((x) => x.tenantId === r.tenant_id)!;
    const t = r.tenants;
    const cat = one(r.store_categories)?.slug ?? null;
    const status = r.launch_status;
    return {
      tenantId: r.tenant_id,
      name: r.name,
      slug: t?.slug ?? m.tenantSlug,
      launchStatus: status === "draft" ? "draft" : status === "live" ? "live" : "unknown",
      category: cat && isIndustry(cat) ? cat : null,
      trialEndsAt: t?.trial_ends_at ?? null,
      planName: one(t?.plans)?.name ?? null,
      draftThemeKey: draftKey.get(r.tenant_id) ?? null,
    };
  });
}

/** Plan/theme the seller picked on the marketing site: URL first, then what sign-up saved. */
export async function requestedChoices(sp: Record<string, string | string[] | undefined>): Promise<{ plan: string | null; theme: string | null }> {
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  let plan = cleanPlanCode(q("plan"));
  let theme = isThemeKey(q("theme")) ? q("theme") : null;
  if (!plan || !theme) {
    const { data } = await (await createSupabaseServerClient()).auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    plan ??= cleanPlanCode(meta.requested_plan);
    theme ??= typeof meta.requested_theme === "string" && isThemeKey(meta.requested_theme) ? meta.requested_theme : null;
  }
  return { plan, theme };
}

/**
 * Tenant context for a store the user OWNS, built from fresh memberships (the per-request
 * requireTenant() reads the active-store cookie, which may point elsewhere during onboarding).
 * Returns null when the user doesn't own `tenantId`, so a forged store id is rejected.
 */
export async function ownerContext(user: SessionUser, tenantId: string): Promise<TenantContext | null> {
  const memberships = await listMemberships(user.id);
  const m = memberships.find((x) => x.tenantId === tenantId && x.role === "owner");
  if (!m) return null;
  return {
    user,
    tenantId: m.tenantId,
    tenantName: m.tenantName,
    tenantSlug: m.tenantSlug,
    tenantStatus: m.tenantStatus,
    role: m.role,
    customRoleName: null,
    permissions: membershipPermissions(m),
    memberships,
  };
}
